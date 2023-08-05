const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');

const bodyParser = require('body-parser');
const twilio = require('twilio');
const openai = require('openai');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const salt = bcrypt.genSaltSync(10);
const secret = 'asdfe45we45w345wegw345werjktjwertkj';

// app.use(cors({
//   methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH', 'VERIFY'],
//   credentials: true,
//   // origin: 'https://axe-blogs.vercel.app'
//   origin: '*'
// }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

const accountSid = 'ACa11021a29ca5245213d79d5b4b970fa3';
const authToken = '7fa2630caa69e36b764da90cb1c0f28c';
const client = new twilio(accountSid, authToken);

openai.api_key = "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";

function getCompletion(prompt, model = "gpt-3.5-turbo") {
    const messages = [{ role: "user", content: prompt }];
    const response = openai.ChatCompletion.create({
        model: model,
        messages: messages,
        temperature: 0,
    });
    return response.choices[0].message.content;
}

function getCompletionFromMessages(messages, model = "gpt-3.5-turbo", temperature = 0, max_tokens = 500) {
    const response = openai.ChatCompletion.create({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: max_tokens,
    });
    return response.choices[0].message.content;
}

app.post('/whatsapp', async (req, res) => {
    const messages = [
        {
            role: 'system',
            content: `You are an ancient medicine practitioner , your skills include Ayurvedic Doctor , Yoga Teacher, Nutritionalist / Dietician , Gym Trainer . You have to decide which among your skills can suit to best help your clients problem , give him herbal and natural solutions not having to use any artificial medicines.`
        },
        {
            role: 'user',
            content: req.body.Body // Assuming the incoming message is in the 'Body' field
        }
    ];

    const response = getCompletionFromMessages(messages, temperature = 1);
    const chunkSize = 1200;
    const stringChunks = splitString(response, chunkSize);

    client.messages
        .create({
            from: 'whatsapp:+14155238886',
            body: stringChunks,
            to: `whatsapp:${req.body.From}` // Assuming the sender's phone number is in the 'From' field
        })
        .then(message => console.log(message.sid))
        .catch(error => console.error(error));

    res.send('Message sent');
});
function splitString(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

mongoose.connect('mongodb+srv://AxeAdmin:dwwePT1tWk6KXxEm@axechat.xaodyf9.mongodb.net/?retryWrites=true&w=majority');

app.post('/register', async (req,res) => {
  const {username,password} = req.body;
  try{
    const userDoc = await User.create({
      username,
      password:bcrypt.hashSync(password,salt),
    });
    res.json(userDoc);
  } catch(e) {
    console.log(e);
    res.status(400).json(e);
  }
});


// app.post('/whatsapp', async (req, res) => {
//   const postedData = req.body;

//   // Construct the plain text response
//   const textResponse = JSON.stringify(postedData, null, 2);
  
//   res.send(textResponse);
// });

app.post('/login',   async (req,res) => {
  const {username,password} = req.body;
  const userDoc = await User.findOne({username});
  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) => {
      if (err) throw err;
      res.cookie('token', token).json({
        id:userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json('wrong credentials');
  }
});

app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      
      // Handle the error appropriately, e.g., send an error response to the client
      return res.status(401).json({ error: 'Invalid or expired token.', token: token });
    }
    res.json(info);
  });
});

app.post('/logout', (req,res) => {
  res.cookie('token', '').json('ok');
});

app.post('/post',   uploadMiddleware.single('file'), async (req,res) => {
  const {originalname,path} = req.file;
  const parts = originalname.split('.');
  const ext = parts[parts.length - 1];
  const newPath = path+'.'+ext;
  fs.renameSync(path, newPath);

  const {token} = req.cookies;
  jwt.verify(token, secret, {}, async (err,info) => {
    if (err) throw err;
    const {title,summary,content} = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover:newPath,
      author:info.id,
    });
    res.json(postDoc);
  });

});

app.put('/post',  uploadMiddleware.single('file'), async (req,res) => {
  let newPath = null;
  if (req.file) {
    const {originalname,path} = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    newPath = path+'.'+ext;
    fs.renameSync(path, newPath);
  }

  const {token} = req.cookies;
  jwt.verify(token, secret, {}, async (err,info) => {
    if (err) throw err;
    const {id,title,summary,content} = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json('you are not the author');
    }
    await postDoc.update({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  });

});

app.get('/post',   async (req,res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({createdAt: -1})
      .limit(20)
  );
});

app.get('/post/:id',  async (req, res) => {
  const {id} = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
})

app.listen(4000);
//
