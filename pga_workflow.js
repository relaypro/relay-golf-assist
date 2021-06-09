import { relay } from '@relaypro/sdk'
import pkg from '@relaypro/sdk'
const { Event, Taps, Button, createWorkflow, notificationEvent } = pkg

const createApp = (relay) => {
    console.log("app is hosted and running")

    relay.on(Event.START, async () => {
        let deviceName = await relay.getDeviceName()
        let deviceId = await relay.getDeviceId()
        let text = await relay.getVar(`text`)
        let channel = await relay.getVar(`channel`)
        let ts = await relay.getVar(`ts`)
        let response_url = await relay.getVar(`response_url`)
        relay.alert(`pga`,`trigger recieved.`,['Pga'])
    })

    relay.on(`button`, async (button, taps) => {
        console.log("button clicked")
        console.log(button)
        if (button.button === `action`) {
            console.log("action button")
            if (button.taps === `single`) {
                if ( new_message ) {
                    new_message = false
                    await relay.say(`Press and hold to record your message`)
                    message = await relay.listen()
                    console.log(message)
                    await relay.say(`Message is: ${message.text}`)
                    await relay.say(`Tap once to send. Double tap to exit`)
                } else if ( !new_message ) {
                    new_message = true
                    console.log(`Sending to: ${to_number}`)
                    await send_text(message.text, to_number)
                    await relay.say(`Message sent.`)
                    message = ''
                }
            } else if (button.taps === `double`) { 
                await relay.say(`Goodbye`)
                await send_text(`+1${stripped_number}`, `Relay+ has ended the conversation`)
                await relay.terminate()
            }
        }
    })
}

export default createApp