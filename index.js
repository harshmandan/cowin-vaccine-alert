const express = require("express");
const app = express();
const schedule = require("node-schedule");
const port = process.env.PORT ? process.env.PORT : 3066;
const moment = require("moment");
const request = require("requestretry");
const _ = require("dotenv").config();

app.use(function (req, res, next) {
	res.status(200).send({ status: "up and running" });
}); //does nothing

app.listen(port, () => {
	console.log(`Server is listening on port: ${port}`);
}); //start the server

const cronJob = schedule.scheduleJob("*/10 * * * * *", function () {
	console.log("executing at:", Date.now());
	requestLoop();
}); //executes every 10 seconds

//config
const states = [29];
const districts = [505, 506];
const vaccine = "COVISHIELD";
const pinBlacklist = [];
const tgBotAPIKey = process.env.tgBotAPIKey;
const tgChannelName = process.env.tgChannelName;
const tgBotURL = `https://api.telegram.org/bot${tgBotAPIKey}/sendMessage?parse_mode=MarkdownV2&chat_id=${tgChannelName}`;
const url = "https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict";

async function requestLoop() {
	const tomorrow = moment().add(1, "days").format("DD-MM-YYYY");
	const today = moment().format("DD-MM-YYYY");

	states.forEach((state_id) => {
		districts.forEach((district_id) => {
			sendRequest(state_id, district_id, tomorrow);
		});
	});
}

async function sendRequest(sid, did, date) {
	request(
		{
			method: "GET",
			url: `${url}?district_id=${did}&date=${date}`,
			maxAttempts: 2,
			retryDelay: 1000,
			retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
		},
		function (err, response, body) {
			if (response) {
				if (response.statusCode == 200) {
					checkIfSlotsExist(JSON.parse(body), did);
				} else {
					console.error("Cowin server responded with an error");
				}
			} else {
				//Activity Log goes here
				console.error("Error contacting cowin server");
			}
		}
	);
}

async function checkIfSlotsExist(body, did) {
	if (body.sessions.length > 0) {
		let filtered = body.sessions.filter(
			(o) =>
				o.vaccine == vaccine &&
				o.min_age_limit == 18 &&
				o.available_capacity_dose1 > 0 &&
				!pinBlacklist.includes(o.pincode)
		);

		if (filtered.length > 0) {
			let district = did == 505 ? "Jaipur I" : "Jaipur II";
			let message = `__${district}__ Vaccine available at : \n\n`;
			filtered.forEach((o) => {
				message += `__${vaccine}__ *${o.pincode}*, slots: *${o.available_capacity_dose1}*, price: *${o.fee}* \n`;
			});
			console.log("slots exists", message);
			sendMessagetoTelegramBot(message);
		} else {
			console.log("no slots exists found");
		}
	} else {
		console.log("no session found");
	}
}

async function sendMessagetoTelegramBot(message) {
	request(
		{
			method: "GET",
			url: `${tgBotURL}&text=${message}`,
			maxAttempts: 2,
			retryDelay: 1000,
			retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
		},
		function (err, response, body) {
			if (response) {
				if (response.statusCode == 200) {
					console.log("sent message to bot");
				} else {
					console.error("tg server responded with not 200");
				}
			} else {
				//Activity Log goes here
				console.error("Error contacting tg server");
			}
		}
	);
}

module.exports = app;
