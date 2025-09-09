const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const i18n = require('i18n');
const cookieParser = require('cookie-parser');
const http = require('http');

const app = express();

// Use cookie-parser
app.use(cookieParser());

// i18n configuration
i18n.configure({
  locales: ['en', 'te', 'hi'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  queryParameter: 'lang',
  cookie: 'i18n'
});
app.use(i18n.init);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/rythuBazar', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error(err));

// Set view engine and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Setup sessions
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: true
}));

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = require('socket.io')(server);
app.set('socketio', io);

// Routes
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');
app.use('/', indexRoutes);
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
