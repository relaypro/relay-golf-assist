import { relay } from '@relaypro/sdk'
import pkg from '@relaypro/sdk'
import axios from 'axios'
const { Event, Taps, Button, createWorkflow, notificationEvent } = pkg

const createApp = (relay) => {
    console.log("app is hosted and running")
    let text
    let session_id
    let state
    let terminating_id

    relay.on(Event.START, async () => {
        relay.alert(`pga`,`trigger recieved.`,['990007560159094'])
    })

    relay.on(`start`, async () => {
        text = await relay.getVar(`text`)
        session_id = await relay.getVar(`session_id`)
        terminating_id = await relay.getDeviceId()
        state = 0
        console.log("session ID from within workflow: " + session_id)
        console.log(text)
        await relay.say(`Pickup requested at ${text} 
            tap once to accept, double tap to reject
        `)
    })

    relay.on(`button`, async (button, taps) => {
        console.log("button clicked")
        console.log(button)
        let session_id = await relay.getVar(`session_id`)
        if (button.button === `action`) {
            console.log("action button")
            if (button.taps === `single`) {
                if (state === 0) {
                    await relay.say("pickup request accepted")
                    state = 1
                    await axios.post(`https://relay-pga.herokuapp.com/request/stage/${state}/${session_id}`,
                        {
                            name: "shams",
                            cart_number: "14"
                        }
                    )
                } else if (state === 1) {
                    await relay.say("drop off request completed")
                    state = 2
                    await axios.post(`https://relay-pga.herokuapp.com/request/stage/${state}/${session_id}`,
                        {
                            name: "shams",
                            cart_number: "14",
                            device_id: terminating_id
                        }
                    )
                    await relay.terminate()
                }

            } else if (button.taps === `double`) { 
                if (state === 0) {
                    await relay.say(`Request terminated`)
                    await axios.post(`https://relay-pga.herokuapp.com/request/reject/${session_id}`,
                        {
                            device_id: terminating_id,
                        }
                    )
                    await relay.terminate()
                } else {
                    await relay.say(`Pickup requested at ${text}`)
                }
            }
        }
    })
}

export default createApp