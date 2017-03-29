// import { Cli, Bridge, AppServiceRegistration } from 'matrix-appservice-bridge';
const Cli = require('matrix-appservice-bridge').Cli;
const Bridge = require('matrix-appservice-bridge').Bridge;
const AppServiceRegistration = require('matrix-appservice-bridge').AppServiceRegistration;

const http = require('http');
const Bot = require('messenger-bot');
const request = require('request-promise');

let bridge, bot;

/**
 * @TODO make fb->mx gifs work (sticker GIFs break, real GIFs work...)
 * @TODO test fb->mx file transfers (PDFs etc)
 * @TODO mx->fb files/image transfers
 * @TODO look into better output methods on the facebook platform
 * @TODO opt in/out for fb side instead of hardcode to me
 */

new Cli({
    registrationPath: 'messenger-registration.yaml',
    generateRegistration: (reg, callback) => {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart('messengerbot');
        reg.addRegexPattern('users', '@messenger_.*', true);
        reg.addRegexPattern('aliases', '#messenger_.*', false);
        callback(reg);
    },
    bridgeConfig: {
        schema: 'messenger-config-schema.yaml'
    },
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

                console.dir(payload);

                if (payload.message.attachments && payload.message.attachments.length) {

                    let intent = bridge.getIntent("@messenger_" + payload.sender.id + ':' + config.homeserver.domain);
                    payload.message.attachments.forEach(attachment => {
                        if (attachment.type === 'image')
                            request.get({
                                uri: attachment.payload.url,
                                resolveWithFullResponse: true,
                                encoding: null
                            }).then(response => {
                                intent.getClient().uploadContent(new Buffer(response.body, 'binary'), {
                                    type: response.headers['content-type'],
                                    rawResponse: false
                                }).then(response => {
                                    intent.sendMessage(config.homeserver.room_id, {
                                        msgtype: 'm.image',
                                        url: response.content_uri,
                                        body: 'facebookImage.jpg'
                                    });
                                }).catch(e => console.error(e));

                            });
                    });

                } else if (text.startsWith('!')) {
                    let split = text.split(' ', 2);
                    switch (split[0]) {
                        case '!NICK':
                            reply({
                            text: "Nick changed to "+ split[1] }, err => {
                                if (err) throw err;

                                let intent = bridge.getIntent("@messenger_" + payload.sender.id + ':' + config.homeserver.domain);
                                intent.setDisplayName(split[1]);

                                console.log(`Nick Change for ${profile.first_name} ${profile.last_name}: ${text}`)
                            });
                    }
                } else {
                    let intent = bridge.getIntent("@messenger_" + payload.sender.id + ':' + config.homeserver.domain);
                    intent.sendText(config.homeserver.room_id, text);

                    console.log(`Forwarded ${profile.first_name} ${profile.last_name}: ${text}`)
                }

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
        console.log('Facebook-side listening on port 3000.');
    }
}).run();