import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { relay } from '@relaypro/sdk'
import EventEmitter from 'events'
import ejs from 'ejs'
import pga from './pga_workflow.js'
import dotenv from 'dotenv'
import axios from 'axios'
import distance from 'distance-from'
import qs from 'qs'
import Cookies from 'cookies'
import { nanoid } from 'nanoid'
import PgaDB from './schemas/pgaDB.js'
import cookieParser from 'cookie-parser'
dotenv.config()

/*
add in your ibot endpoint. For the relay endpoints, just add in each device manually and
their workflow urls into the relay_endpoints object below 

as an example, the wf_id should look like: `/ibot/workflow/wf_wfname_1iWuhILUGHnKJYF`
*/
const ibot_endpoint = process.env.IBOT_ENDPOINT
const relay_endpoints = {
    990007560158088: process.env.RELAY_88_WF_ID,
    990007560159094: process.env.RELAY_94_WF_ID,
}

let form = [`<div class="complete">
<h1>
  <span class="number">&#10003</span>
  Searching for an available golf cart
</h1>
A golf cart will be assigned to you shortly
<h1></h1>
</div>`]
let requests = {}
let pickup_name
let cart_number
let location_mapping = []
let jobs = {}
let available_flag = false

/*
* Express server config
*/  
const port = process.env.PORT || 3000
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const _server = express()
_server.set('view engine', 'ejs')
_server.use(express.urlencoded({extended: true}))
_server.use(cookieParser())
_server.use(express.json())
_server.use(express.static(path.join(__dirname ,'views/index.html')))
_server.get('/', function(req, res) {
    res.render("index")
})
_server.get('/assets/logo.png', function(req, res) {
    res.sendFile(path.join(__dirname, '/assets/logo.png'))
})
_server.get('/assets/favicon.png', function(req, res) {
    res.sendFile(path.join(__dirname, '/assets/favicon.png'))
})
_server.get('/styles/style.css', function(req, res) {
    res.sendFile(path.join(__dirname, '/styles/style.css'))
})
_server.get('/styles/loading.css', function(req, res) {
    res.sendFile(path.join(__dirname, '/styles/loading.css'))
})
const server = _server.listen(port, function() {
    console.log("Web server listening on port: " + port)
})

/*
* This is where it all starts
* The request comes in through this endpoint
* We first check if a cookie exists to store the session of the user request or we generate it
* It then polls for the closest relays and sorts them
* We redirect to the /location endpoint as that is where we want 15s refreshing interval to happen
* 
* :location = Name of the location in text eg. Hole 18
* :lat = latitude point of the location
* :long = longitude point of the location
*/
_server.get('/loc/:location/:lat/:long', async function(req, res) {

    let cookies = new Cookies(req, res)
    let session_id = null
    if (!req.cookies['session_id']) {
        // if no cookies, generate cookie and pass it along to redirect
        session_id = nanoid()
        cookies.set('session_id', session_id)
    } else {
        //cookie exits, retrieve cookie and use
        session_id = cookies.get('session_id')
    }

    available_flag = true
    let location_name = req.params.location
    let request_lat = Number(req.params.lat)
    let request_long = Number(req.params.long)
    let request_location = [request_lat, request_long]
 
    let access_token = await get_access_token()
    let devices = get_active_relays()

    // For the devices retrieved from the get_active_relays() func, 
    // the below function adds them to an object(`jobs`) that manages the activity state of the relay
    devices.forEach(function(device) {
        if (!(device in jobs)) {
            jobs[device] = false
        }
    })
    console.log(`${access_token} access token`)
    res.redirect(307, '/location?session_id=' + session_id)
    await sort_closest_relays(devices, access_token, location_name, request_location)
})

/*
* This is the endpoint for what the user sees on his screen
* Within the loading.ejs file, there is a script that refreshes the page every 15s
* That means that this endpoint gets called every 15s
* If there is an update in the state of the process, it updates on the user's screen when the screen refreshes
*
* For each session_id, there are states according to how far along the process the user is at
* the states are stored in mongoDB
* For each session_id, code looks to see if an existing state exists and populate the users UI based on that
* If no state exists for a session_id, then populate screen with initial state (using `form` variable)
*
* QUERY: session_id = the idenitfier (cookie) used to target the source of the request
*/
_server.get('/location', async function(req, res) {
    let cookies = new Cookies(req, res) 
    let session_id = req.query.session_id
    session_id = cookies.get('session_id')
    console.log("preexisting session cookie being used: " + session_id)
    let html
    await PgaDB.findOne({session_id: session_id}, function(err, post){
        if (post !== null) {
            html = post.state
            res.render('loading', {form: html})
        } else {
            console.log("Saving cookie to db ")
            const post = new PgaDB({
                session_id: session_id,
                state: form,
            })
            post.save(function(err){
                if (err){
                    console.log("error while saving cookie state")
                } else {
                    console.log("successfully saved")
                    res.render('loading', {form: form})
                }
            })
        }
    })
    call_relays(session_id)
})

/*
* This function queries all relays for an account via API
* and returns a list of their device_ids
*
* For demo purposes, this returns a static list of device_ids
*/
function get_active_relays() {
    let device_ids = [process.env.RELAY_88_ID, process.env.RELAY_94_ID]
    return device_ids
}

/*
* This function filters and selects the most optimal relay bsed on location and availability
* Once a relay is selected, it calls the send_notification function to initiate the workflow on that device
* If a device isn't available, it chooses the second closest device
*
* PARAM session_id = the idenitfier (cookie) used to target the source of the request
*/
function call_relays(session_id) {
    if (requests[session_id]) {
        if (requests[session_id].state === 0 || requests[session_id].state === 2) {
            // if a relay hasn't been called for a specific request, find an available relay
            let closest_device_arr = requests[session_id].distances
            if (closest_device_arr.length === 0) {
                //no active devices running
                //do something i guess
            } else {
                let closest_device_id = closest_device_arr[0].id
                if (!jobs[closest_device_id]) {
                    jobs[closest_device_id] = true
                    console.log("CALL_RELAYS FUNCTION")
                    console.log(closest_device_arr)
                    requests[session_id].state = 1
                    let location = closest_device_arr[0].loc_name
                    send_notification(closest_device_id, location, session_id)
                } else {
                    let filtered_arr = closest_device_arr.filter(loc =>
                        loc.id !== closest_device_id
                    )
                    requests[session_id].distances = filtered_arr
                }
            }
        }
    } else {
        //do nothing and wait until session_id is populated since it takes ~15 seconds for the function to get location of relays
    }
}

/*
* This function initiates the workflow on the specified device_id
*/
async function send_notification(device_id, location, session_id) {
    let access_token = await get_access_token()
    console.log("IN SEND_NOTIFICATION")
    const params = qs.stringify({
        'subscriber_id': process.env.SUBSCRIBER_ID,
        'user_id': device_id
    })
    let relay_endpoint = relay_endpoints[device_id]
    let name
    let cart_number
    if (device_id === process.env.RELAY_94_ID) {
        name = `driver1`
        cart_number = `1`
    } else {
        name = `driver2`
        cart_number = `2`
    }
    try { 
        const response = await axios.post(`${ibot_endpoint}${relay_endpoint}?${params}`,
            {
                "action": "invoke",
                "action_args": {
                    "text": location, 
                    "session_id": session_id,
                    "name": name,
                    "cart_number": cart_number
                }
            },
            { 
                headers : {
                    'Authorization': 'Bearer ' + access_token
                }
            })
        if (response.status == 200 || response.status == 400) {
            console.log(`Remote trigger invoked`)
            console.log(response.statusText)
        } else {
            console.log('something wrong happened within send_notification')
        }
    } catch (e) {
        console.error(e)
    }
}

/*
* This function retrieves location of each active relay
*/
async function get_relay_location(relay_id, access_token, loc_name) {
    let lat_long = null
    let sub_ID = process.env.SUBSCRIBER_ID
    let response = await axios({
        method: 'get',
        url: `${process.env.IBOT_ENDPOINT}/ibot/device/${relay_id}?subscriber_id=${sub_id}`,
        headers: {
            'Authorization': 'Bearer ' + access_token
        },
        rejectUnauthorized: false
    })
    let body = response.data
    let lat = body.device_details.location.lat
    let long = body.device_details.location.long
    lat_long = {
        id: relay_id,
        lat: lat,
        long: long,
        loc_name: loc_name
    }
    return lat_long
}

/*
* This function generates an access token to hit the ibot API
*/
async function get_access_token() {
    let response = await axios({
        method: 'post',
        headers: {
            'content-type' : 'application/x-www-form-urlencoded', 
            'Authorization': `Basic ${process.env.TOKEN}`
        },
        url: process.env.OAUTH_ENDPOINT,
        data: qs.stringify({
            grant_type: 'password',
            client_id: process.env.CLIENT_ID,
            scope: 'openid',
            username: process.env.TOKEN_USERNAME,
            password: process.env.TOKEN_PASS
        }),
    })
    return response.data.access_token
}

/*
* For each relay, find location
* compare and sort based on closest to the request location
* update the closest relays in the requests object off of session_id (the cookie)
* Essentially, each request will have a sorted array of closest relays associated with it
*
* PARAM devices = array of devices associated with an account
* PARAM access_token = bearer token used to hit location endpoint for each relay
* PARAM location_name = the name of the location used to identify the pickup spot
* PARAM request_location = an array of size 2 with the lat and long of the request location eg. [34.21374, -74.1394810]
*/
async function sort_closest_relays(devices, access_token, location_name, request_location) {
    location_mapping = await Promise.all(devices.map(x => get_relay_location(x, access_token, location_name)))
    location_mapping.forEach(function(map) {
        let relay_location = [map.lat, map.long]
        map.distance = distance(request_location).to(relay_location).in('cm')
    })
    location_mapping.sort(function(a, b) {
        return a.distance - b.distance
    })
    requests[session_id] = {
        location_details : {
            loc_name: location_name,
            lat: request_lat,
            long: request_long,
        },
        distances: location_mapping,
        state: 0,
        called: []
    }
    console.log(location_mapping)
}







/*
=
=
=
BELOW ARE ENDPOINTS AND FUNCTIONS USED INTERNALLY BY THE WORKFLOW
=
=
=
*/

/*
* This is the endpoint that is internally hit by the workflow when the relay updates its state
* This route is NOT supposed to be pinged by anything other than the workflow
* Once the workflow goes into a new state, it send a POST request here based off of the state which is passed in as a param
* The function below then checks the state and based off of it, saves a new state to the MongoDB so that when the user's page refreshes again, it
*   shows up on their page
*
* :state = the state coming in from the relay which needs to be updated for the user
* :session_id = the cookie to target the user that needs their state updated
*/
_server.post('/request/stage/:state/:session_id', async function(req, res) {
    console.log(`post request recieved!!!!`)
    let stage = req.params.state
    let session_id = req.params.session_id
    let html = null
    console.log("stage: " + stage)
    if (stage === "1") {
        pickup_name = req.body.name
        cart_number = req.body.cart_number
        html = `
            <div class="complete">
            <h1>
                <span class="number">&#10003;</span>
                Golf cart assigned
            </h1>
                ${pickup_name} will pick you up shortly in golf cart #${cart_number}
            </div>
        `
    } else if (stage === "2") {
        html = `
            <div class="complete">
            <h1>
            <span class="number">&#10003;</span>
            ${pickup_name} has dropped you off
            </h1>
            thank you for riding!
            </div>
        `
        let device_id = req.params.device_id
        jobs[device_id] = false
    }
    await PgaDB.findOneAndUpdate({session_id: session_id}, { $addToSet: { state: html  } }, function(err, success){
        if (err) {
            console.log(err)
        } else {
            console.log(success)
            res.sendStatus(200)
        }
    })
})

/*
* This is the endpoint that is internally hit by the workflow when the relay does not accept a pickup request
* This route is NOT supposed to be pinged by anything other than the workflow
* It sets the associated relay's status to available and prevents that relay from being called again
*
* :session_id = the cookie to target the user that needs their state updated
*/
_server.post('/request/reject/:session_id', function(req, res) {
    //relay did not accept request, change state to 2
    let session_id = req.params.session_id
    let device_id = req.body.device_id
    jobs[device_id] = false
    requests[session_id].state = 2
    requests[session_id].called.push(device_id)
    let closest_device_arr = requests[session_id].distances
    let filtered_arr = closest_device_arr.filter(loc =>
        loc.id !== device_id
    )
    requests[session_id].distances = filtered_arr
    console.log(requests)
    console.log(requests[session_id].distances)
    res.sendStatus(200)
})

const app = relay({server})
app.workflow(`pga`, pga)
