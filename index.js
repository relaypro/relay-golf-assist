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
const relay_endpoint = `/ibot/workflow/wf_pga_3rq5sJKzGpfI4i2HYaspuB`
const ibot_endpoint = `https://all-api-qa-ibot.nocell.io`

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
let api_token = null
let active_devices = []
let location_mapping = []
let jobs = {}
let count = 0
let available_flag = false
export const eventEmitter = new EventEmitter()    
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
    devices.forEach(function(device) {
        if (!(device in jobs)) {
            jobs[device] = false
        }
    })
    console.log(`${access_token} access token`)
    res.redirect(307, '/location?session_id=' + session_id)
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
    eventEmitter.emit(`http_event`, location_name)
})

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

_server.post('/request/stage/:stage/:session_id', async function(req, res) {
    console.log(`post request recieved!!!!`)
    let stage = req.params.stage
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

const app = relay({server})
app.workflow(`pga`, pga)

/*
* This function queries available relays via API
* and returns a list of their device_ids
*
* For demo purposes, this returns a static list of device_ids
*/
function get_active_relays() {
    let device_ids = ['990007560158088', '990007560159094']
    return device_ids
}

function call_relays(session_id) {
    if (requests[session_id]) {
        if (requests[session_id].state === 0) {
            // if a relay hasn't been called for a specific request, find an available relay
            let closest_device_arr = requests[session_id].distances
            if (closest_device_arr.length === 0) {
                //no active devices running
                //do something
            } else {
                console.log("CALL_RELAYS FUNCTION")
                requests[session_id].state = 1
                let closest_device_id = closest_device_arr[0].id
                let location = closest_device_arr[0].loc_name
                send_notification(closest_device_id, location, session_id)
            }
        }
    } else {
        //do nothing and wait until session_id is populated since it takes ~15 seconds for the function to get location of relays
    }
}

async function send_notification(device_id, location, session_id) {
    let access_token = await get_access_token()
    console.log("IN SEND_NOTIFICATION")
    const params = qs.stringify({
        'subscriber_id': `9bd6be6f-3b96-4b55-a807-468c3f6c428c`,
        'user_id': device_id
    })
    try { 
        const response = await axios.post(`${ibot_endpoint}${relay_endpoint}?${params}`,
            {
                "action": "invoke",
                "action_args": {
                    "text": `pickup requested at ${location}`, 
                    "session_id": session_id,

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
    let response = await axios({
        method: 'get',
        url: `https://all-api-qa-ibot.nocell.io/ibot/device/${relay_id}?subscriber_id=9bd6be6f-3b96-4b55-a807-468c3f6c428c`,
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
            'Authorization': 'Basic UlNjcVNoNGs6TFU2NE1FSjhCeWlqM0ozOA=='
        },
        url: 'https://auth.republicdev.info/oauth2/token',
        data: qs.stringify({
            grant_type: 'password',
            client_id: 'RScqSh4k',
            scope: 'openid',
            username: process.env.TOKEN_USERNAME,
            password: process.env.TOKEN_PASS
        }),
    })
    return response.data.access_token
}
