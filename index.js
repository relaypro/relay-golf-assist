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
dotenv.config()

let form = [`<div class="complete">
<h1>
  <span class="number">&#10003</span>
  Searching for an available golf cart
</h1>
A golf cart will be assigned to you shortly
<h1></h1>
</div>`]
let pickup_name
let cart_number
let api_token = null
let active_devices = []
let location_mapping = []
let count = 0
export const eventEmitter = new EventEmitter()    
const port = process.env.PORT || 3000
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const _server = express()
_server.set('view engine', 'ejs')

_server.use(express.urlencoded({extended: true}))
_server.use(express.json())
_server.use(express.static(path.join(__dirname ,'views/index.html')))

_server.get('/', function(req, res) {
    res.render("index")
})

_server.get('/loc/:location/:lat/:long', async function(req, res) {
    res.render('loading', {form: form})
    if (location_mapping.length === 0) {
        console.log("WHy is it in here: " + location_mapping.length)
        console.log("counter: " + count)
        count += 1
        let location_name = req.params.location
        let request_lat = Number(req.params.lat)
        let request_long = Number(req.params.long)
        let request_location = [request_lat, request_long]
        let access_token = await get_access_token()
        let devices = get_active_relays()
        location_mapping = await Promise.all(devices.map(x => get_relay_location(x, access_token)))
        location_mapping.forEach(function(map) {
            let relay_location = [map.lat, map.long]
            map.distance = distance(request_location).to(relay_location).in('cm')
        })
        location_mapping.sort(function(a, b) {
            return a.distance - b.distance
        })
        eventEmitter.emit(`http_event`, location_name)
    }
})

_server.get('/location', function(req, res) {
    res.render("loading", {form: form})
})

_server.post('/request/stage/:stage', function(req, res) {
    let stage = req.params.stage
    let html = ``
    console.log("stage: " + stage)
    console.log(req)
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
    form.push(html)
    res.sendStatus(200)
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


/*
* This function retrieves location of each active relay
*/
async function get_relay_location(relay_id, access_token) {
    let lat_long = null
    let response = await axios({
        method: 'get',
        url: 'https://all-api-qa-ibot.nocell.io/ibot/device/990007560158088?subscriber_id=<SUBSCRIBER_ID>',
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
        long: long
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
