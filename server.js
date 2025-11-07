var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

require('dotenv').config();

var app = express();

var port = process.env.PORT || 3000;

if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not defined in .env file');
    console.error('Please create a .env file with your MongoDB Atlas connection string');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', function () {
    console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', function (err) {
    console.error('MongoDB connection error:', err);
    console.error('Please check your MONGODB_URI in .env file');
});

mongoose.connection.on('disconnected', function () {
    console.log('MongoDB disconnected');
});

var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

require('./routes')(app, router);

app.listen(port, function () {
    console.log('Server running on port ' + port);
    console.log('API endpoints available at http://localhost:' + port + '/api');
});

process.on('SIGINT', function () {
    mongoose.connection.close(function () {
        console.log('MongoDB connection closed due to app termination');
        process.exit(0);
    });
});
