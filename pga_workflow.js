import { relay } from '@relaypro/sdk'
import pkg from '@relaypro/sdk'
const { Event, Taps, Button, createWorkflow, notificationEvent } = pkg

const createApp = (relay) => {
    console.log("app is hosted and running")

    relay.on(`start`, async () => {
        let id = await relay.getDeviceId();
        console.log("The relay device ID is : " + id.toString());
        await relayTwilio.findOne({user_id: id.toString()}, function(err, post){
            console.log(post)
            if (post !== null) {
                console.log(post)
                to_number = post.number
                name = post.name
            }
        })
        console.log(to_number)
        if (to_number === null) {
            await relay.say(`Who would you like to text?`)
            const get_number = await relay.listen(['$FULLPHONENUM'])
            console.log(get_number)
            number = get_number.text
            //stripped_number = number.replace(/-/g,"")
            console.log(`phone number is ${number}`)
            await relay.say(`What is ${number}'s name?`)
            name = await relay.listen(["iPhone", "Leena", "Ibraheem"])
            //name = get_number
        }
        await relay.say(`Tap once to send ${name} a message. Double tap to exit`)

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