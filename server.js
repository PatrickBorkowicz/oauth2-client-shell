var cookieName = "oAuth2ClientShell";

var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var request = require('superagent');

var views = require('./lib/views');

var state = "5ca0b32f-388b-4e24-a86c-64fd5b764ba3";
var port = process.env.PORT || 3000;
var cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
};

var app = express();
app.set('view engine', 'ejs');
app.enable('trust proxy');

app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', function(req, res) {
    var cookie = req.cookies[cookieName] || {};

    if (req.query.reset === "true") {
        res.cookie(cookieName, "", { expires: new Date() });
        res.render('index', views.index({}));
    } else if (req.query.clear === "true") {
        cookie.authCode = null;
        cookie.accessToken = null;
        cookie.refreshToken = null;
        cookie.focus = null;
        res.cookie(cookieName, cookie, cookieOptions);
        res.render('index', views.index(cookie));
    } else if (req.query.state && req.query.state !== state) {
        var error = `Authorization endpoint sent back the wrong state! Expected '${req.query.state} but got '${state}' from the server.`;
        res.render('index', views.index(cookie, error));
    } else {
        cookie.authCode = req.query.code || cookie.authCode;
        res.render('index', views.index(cookie, req.query.error));
    }
});

app.post('/auth', function(req, res) {
    var cookie = req.cookies[cookieName] || {};
    cookie.authEndpoint = req.body.auth_endpoint;
    cookie.clientId = req.body.client_id;
    cookie.scope = req.body.scope;
    cookie.customParams = req.body.custom_params;
    cookie.focus = "user-tokens";
    cookie.authCode = null;
    res.cookie(cookieName, cookie, cookieOptions);

    var authCodeRequest = cookie.authEndpoint
        + "?response_type=code"
        + "&redirect_uri=" + req.protocol + "://" + req.headers.host + "/"
        + "&client_id=" + cookie.clientId
        + "&scope=" + cookie.scope
        + "&state=" + state
        + "&" + cookie.customParams;

    res.redirect(authCodeRequest);
});

app.post('/token', function(req, res) {
    var cookie = req.cookies[cookieName] || {};
    cookie.tokenEndpoint = req.body.token_endpoint;
    cookie.authCode = req.body.auth_code;
    cookie.clientId = req.body.client_id;
    cookie.clientSecret = req.body.client_secret;
    cookie.focus = "refresh-token";
    cookie.accessToken = null;
    cookie.refreshToken = null;
    res.cookie(cookieName, cookie, cookieOptions);

    var payload = {
        grant_type: "authorization_code",
        redirect_uri: req.protocol + "://" + req.headers.host + "/",
        code: cookie.authCode
    };

    request
        .post(cookie.tokenEndpoint)
        .auth(cookie.clientId, cookie.clientSecret)
        .type('form')
        .send(payload)
        .end(function(err, postResponse) {
            if (err) {
                console.log("Error trading in authorization code:")
                console.log(err);
                res.redirect('/?error=' + JSON.stringify(postResponse.body));
            } else {
                cookie.accessToken = postResponse.body.access_token;
                cookie.refreshToken = postResponse.body.refresh_token || "Not provided by token endpoint.";
                cookie.authCode = "(Used) " + cookie.authCode
                res.cookie(cookieName, cookie, cookieOptions);

                res.redirect('/');
            }
        })
});

app.post('/refresh', function(req, res) {
    var cookie = req.cookies[cookieName] || {};
    cookie.tokenEndpoint = req.body.token_endpoint;
    cookie.refreshToken = req.body.refresh_token;
    cookie.clientId = req.body.client_id;
    cookie.clientSecret = req.body.client_secret;
    cookie.accessToken = null;
    res.cookie(cookieName, cookie, cookieOptions);

    var payload = {
        grant_type: "refresh_token",
        redirect_uri: req.protocol + "://" + req.headers.host + "/",
        refresh_token: cookie.refreshToken
    };

    request
        .post(cookie.tokenEndpoint)
        .auth(cookie.clientId, cookie.clientSecret)
        .type('form')
        .send(payload)
        .end(function(err, postResponse) {
            if (err) {
                console.log("Error trading in refresh token:")
                console.log(err);
                res.redirect('/?error=' + JSON.stringify(postResponse.body));
            } else {
                cookie.accessToken = postResponse.body.access_token;
                cookie.refreshToken = postResponse.body.refresh_token || cookie.refreshToken;
                res.cookie(cookieName, cookie, cookieOptions);

                res.redirect('/');
            }
        })
});

app.listen(port);
console.log(`Started on port ${port}.`);
console.log(`Running with cookieOptions.secure == ${cookieOptions.secure}.`);
