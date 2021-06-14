
# Relay Golf Assist Workflow

The idea behind it: A user is able go to a predefined golf stop and request a golf cart to pick them up and drop them off where needed.

The user would scan a QR located at a golf stop and that would initiate a request to find the closest golf cart via Relay's location mapping functionality. That Relay would then be sent a request on where to pick the user up and an option to accept or decline the request. 
If the request is declined, the second closest relay will be polled and so on until a relay accepts the request. 
If the request is accepted, the user's UI will update to show who will be picking them up. The golf cart driver will then drop off the user and will complete the request. 

The app is live at [relay-golf-assist.herokuapp.com](http://relay-golf-assist.herokuapp.com/)

## Simplified Workflow Architecture
![architecture diagram](https://github.com/relaypro/relay-golf-assist/blob/master/assets/system-architecture.png)
### Paths
`/` homepage with a sample QR CODE

`/loc/:location/:lat/:long` This is how the url is structured within the QR code. Hitting this link will send out the request to find relays based on the latitude and longitude in the params of the url.

## Installation

clone the repository: 

```bash
git clone https://github.com/relaypro/relay-golf-assist.git
```

Make sure you have NodeJS installed, or download it from [NodeJS](https://nodejs.org/en/download/)

Run the following to make sure all relevant libraries and packages are installed:
```bash
npm install
```


## Local Usage (for testing purposes only)

There are a couple of environment variables. Create a .env file by running `touch .env` and place the variables and their values in the .env file.
Eg. 
```python
MONGODB_URI=<your_mongo_database_uri>
TOKEN_USERNAME=<your_admin_relay_account_username>
TOKEN_PASS=<your_admin_relay_account_password>
```

Register a workflow on your Relay device by

```bash
relay workflow:create --type=http --uri=wss://relay-golf-assist.herokuapp.com/golf --name golf-assist <device_id>
```

To run the application: 
```bash
npm start
```

## Built with
![technology stack](https://github.com/relaypro/relay-golf-assist/blob/master/assets/stack.png)

## License
[MIT](https://choosealicense.com/licenses/mit/)
