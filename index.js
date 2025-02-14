const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require("path");

const app = express();

mongoose.connect('mongodb+srv://zaksybekzannur7:2oXRNDvP7KCVsTpJ@cluster0.8beaq.mongodb.net/login?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: '/uploads/default.jpg' },
    incorrectLoginAttempts: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false }
});

const BlockedUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    blockedUntil: { type: Date, required: true }
});

const User = mongoose.model('User', UserSchema);
const BlockedUser = mongoose.model('BlockedUser', BlockedUserSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/'));
app.use('/admin', express.static(path.join(__dirname, 'admin/web')));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web')));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: '4Imp3xlavgXmbWCIXl9dCEomHW4LyGSBCXfuOrF',
    resave: false,
    saveUninitialized: true,
}));

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, req.session.user.username + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.send(`
                <script>
                    alert('Username already exists');
                    window.location.href = '/register.html';
                </script>`);

        }
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.redirect('/login.html');
    } catch (err) {
        console.error(err);
        res.send('Error registering user');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const blockedUser = await BlockedUser.findOne({ username });
        if (blockedUser && blockedUser.blockedUntil > new Date()) {
            return res.send(`
            <script>
                alert('You are blocked until ${blockedUser.blockedUntil}');
                window.location.href = '/login.html';
            </script>`);
        }

        const user = await User.findOne({ username });
        if (user) {
            if (user.isBlocked) {
                return res.send(`
                    <script>
                        alert('Your account is blocked. Please contact support.')
                        window.location.href = '/login.html';

                    </script>`)
            }

            if (await bcrypt.compare(password, user.password)) {
                user.incorrectLoginAttempts = 0;
                await user.save();
                req.session.user = user;
                return res.redirect('/dashboard');
            } else {
                user.incorrectLoginAttempts += 1;
                if (user.incorrectLoginAttempts >= 5) {
                    user.isBlocked = true;
                    const blockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
                    await BlockedUser.create({ username, blockedUntil });
                }
                await user.save();
                return res.send(`
                    <script>
                        alert('Invalid credentials');
                        window.location.href = '/login.html';

                    </script>`)
                
            }
        } else {
            return res.send(`
                <script>
                    alert('Invalid credentials');
                    window.location.href = '/login.html';

                </script>`)
        }
    } catch (err) {
        console.error(err);
        return res.send(`
            <script>
                alert('Error logging in ' + err);
                window.location.href = '/login.html';

            </script>`)
    }
});

app.get('/dashboard', (req, res) => {
    if (req.session.user) {
        res.render('profile', { user: req.session.user });
    } else {
        res.redirect('/login.html');
    }
});

app.post('/update-profile', upload.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login.html');
    const { username, password } = req.body;
    const avatar = req.file ? `/uploads/${req.file.filename}` : req.session.user.avatar;
    try {
        const user = await User.findById(req.session.user._id);
        user.username = username || user.username;
        if (password) user.password = await bcrypt.hash(password, 10);
        user.avatar = avatar;
        await user.save();
        req.session.user = user;
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);

        return res.send(`
            <script>
                alert('Error updating profile');
            </script>`)
        
    }
});

app.delete('/delete-profile', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Unauthorized');
    }

    try {
        await User.deleteOne({ _id: req.session.user._id });
        await BlockedUser.deleteOne({ username: req.session.user.username });
        req.session.destroy(err => {
            if (err) console.error(err);
            res.redirect('/register.html');
        });
    } catch (err) {
        console.error(err);
        return res.send(`
            <script>
                alert('Error deleting profile');
            </script>`)
        }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        
        res.redirect('/login.html');
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web/home.html'));
});

const unblockUsers = async () => {
    try {
        await BlockedUser.deleteMany({ blockedUntil: { $lte: new Date() } });
        await User.updateMany({ isBlocked: true }, { $set: { isBlocked: false, incorrectLoginAttempts: 0 } });
    } catch (err) {
        console.error('Error unblocking users:', err);
    }
};

setInterval(unblockUsers, 60 * 60 * 1000);

app.listen(3000, () => {
    console.log('Server running on port http://localhost:3000');
});