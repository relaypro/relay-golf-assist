import { relay } from '@relaypro/sdk'
import pkg from '@relaypro/sdk'
import axios from 'axios'
const { Event, Taps, Button, createWorkflow, notificationEvent } = pkg

const createApp = (relay) => {
    console.log("app is hosted and running")

    relay.on(Event.START, async () => {
        //let deviceName = await relay.getDeviceName()
        //let deviceId = await relay.getDeviceId()
        //let text = await relay.getVar(`text`)
        //let channel = await relay.getVar(`channel`)
        //let ts = await relay.getVar(`ts`)
        //let response_url = await relay.getVar(`response_url`)
        relay.alert(`pga`,`trigger recieved.`,['990007560159094'])
    })

    relay.on(`start`, async () => {
        let text = await relay.getVar(`text`)
        let session_id = await relay.getVar(`session_id`)
        console.log("session ID from within workflow: " + session_id)
        console.log(text)
        await relay.say(text)
        await relay.say("tap once to accept")
        await relay.say("double tap to reject")
    })

    relay.on(`button`, async (button, taps) => {
        console.log("button clicked")
        console.log(button)
        let session_id = await relay.getVar(`session_id`)
        if (button.button === `action`) {
            console.log("action button")
            if (button.taps === `single`) {
                await relay.say("pickup request accepted")
                let state = 1
                await axios.post(`https://relay-pga.herokuapp.com/request/stage/${state}/${session_id}`,
                    {
                        name: "shams",
                        cart_number: "14"
                    }
                )
                await relay.terminate()
            } else if (button.taps === `double`) { 
                await relay.say(`Request terminated`)
                let terminating_id = await relay.getDeviceId()
                await axios.post(`https://relay-pga.herokuapp.com/request/reject/${session_id}`,
                    {
                        device_id: terminating_id,
                    }
                )
                await relay.terminate()
            }
        }
    })
}

export default createApp