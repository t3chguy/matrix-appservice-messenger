// import { Cli, Bridge, AppServiceRegistration } from 'matrix-appservice-bridge';
const Cli = require('matrix-appservice-bridge').Cli;
const Bridge = require('matrix-appservice-bridge').Bridge;
const AppServiceRegistration = require('matrix-appservice-bridge').AppServiceRegistration;

const http = require('http');
const Bot = require('messenger-bot');

let bridge, bot;

/**
 * @TODO write schema to enforce config file
 * @TODO file uploads
 */

new Cli({
    registrationPath: 'messenger-registration.yaml',
    generateRegistration: (reg, callback) => {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart('messengerbot');
        reg.addRegexPattern('users', '@messenger_.*', true);
        reg.addRegexPattern('aliases', '#messenger_.*', true);
        callback(reg);
    },
    // bridgeConfig: {
    //     schema: 'messenger-config-schema.yaml'
    // },
    run: (port, config) => {

        bot = new Bot({
            token: config.messenger.token,
            verify: config.messenger.verify,
            app_secret: config.messenger.secret
        });

        bot.on('error', (err) => {
            console.log(err.message)
        });

        bot.on('message', (payload, reply) => {
            let text = payload.message.text;

            console.log(payload.sender);

            bot.getProfile(payload.sender.id, (err, profile) => {

                if (err) throw err;

                if (text.startsWith('!')) {
                    let split = text.split(' ', 2);
                    switch (split[0]) {
                        case '!NICK':
                            reply({
                            text: "Nick changed to "+ split[1] }, err => {
                                if (err) throw err;

                                console.log(`Nick Change for ${profile.first_name} ${profile.last_name}: ${text}`)
                            });
                    }
                } else
                    reply({ text }, err => {
                        if (err) throw err;

                        let intent = bridge.getIntent("@messenger_" + payload.sender.id +':'+ config.homeserver.domain);
                        intent.sendText(config.homeserver.room_id, text);

                        console.log(`Echoed back to ${profile.first_name} ${profile.last_name}: ${text}`)
                    });
            });
        });

        bridge = new Bridge({
            homeserverUrl: config.homeserver.url,
            domain: config.homeserver.domain,
            registration: 'messenger-registration.yaml',
            controller: {
                onUserQuery: queriedUser => ({

                }),

                onEvent: (request, context) => {
                    let event = request.getData();
                    console.dir(event);

                    if (event.type !== 'm.room.message' || !event.content || event.room_id !== config.homeserver.room_id) return;

                    bot.sendMessage(1285416551542338, {
                        text: event.sender.split(':', 2)[0] +': '+ event.content.body
                    }, (err, body) => {
                        if (err) throw err;
                    })
                }
            }
        });
        console.log('Matrix-side listening on port %s', port);
        bridge.run(port, config);

        http.createServer(bot.middleware()).listen(3000);
        console.log('Echo bot server running at port 3000.');
    }
}).run();