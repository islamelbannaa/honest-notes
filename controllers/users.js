var express = require('express');
var router = express.Router();
const request = require('request');
const bcrypt = require('bcrypt');
const multer = require('multer');
const shortid = require('shortid');
const mailController = require('./mailer');

const User = require('../models/user');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '../public/data/uploads/profile-pictures');
    },
    filename: function (req, file, cb) {
        let ext = file.originalname.split('.');
        ext = ext[ext.length - 1];
        cb(null, req.params.id + '.' + ext);
    }
});

const fileFilter = (req, file, cb) => {
    console.log(file);
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
        cb(null, true);
    } else {
        cb(new Error("File has to be an image"));
    }
}

var upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 20
    },
    fileFilter: fileFilter,
    onError: (err, next) => {
        next(err);
    }
}).single('avatar');

module.exports.uploadAvatar = (req, res, next) => {
    upload(req, res, function (err) {
        if (err) {
            console.log(err);
            // An error occurred when uploading
            return res.status(403).send({
                message: "File has to be an image"
            });
        }
        res.status(201).send({
            message: "Avatar set"
        });
    });
}

// Register a new user
module.exports.register = (req, res, next) => {
    // parse the data from the request body
    let {
        username,
        fullname,
        email,
        password,
        birthDate,
        gender
    } = req.body;
    let userData = {
        username,
        fullname,
        email,
        password: bcrypt.hashSync(password, 10),
        birthDate,
        gender
    };
    let newUser = new User(userData);

    newUser.save(newUser, (err, data) => {
        if (err) {
            if (err.code === 11000) {
                //check the duplicate field
                console.log(err.message);
                var field = err.message.split('$')[1].split('_1')[0];

                res.status(403).send({
                    code: 11000,
                    message: `${field} already exists`
                });
            } else {
                console.log(err);
                return res
                    .status(500)
                    .send({
                        code: err.code,
                        message: 'Error signing up user. Error undefined'
                    });
            }

        } else {
            mailController.activation(data);
            res.status(201).send({
                message: "User successfully registered",
                id: data._id
            });
        }
    });


}

// Activate the user
module.exports.activate = (req, res, next) => {
    // get the data from the url ex: http://website.com/users/activate/:userId/:code
    let userId = req.params.userId,
        code = req.params.code;

    User.findOne({
        _id: userId
    }).then(user => {
        if (!user) {
            res.status(404).send({
                message: "user not found"
            });
        } else {
            if (user.activationStatus === true) {
                res.status(403).send({
                    message: "User already activated"
                });
            } else {
                if (code === user.activationCode) {
                    User.findOneAndUpdate({
                        _id: user._id
                    }, {
                        activationStatus: true
                    }).then(() => {
                        res.status(200).send({
                            message: "User successfully activated"
                        });
                    })
                } else {
                    res.status(401).send({
                        message: "invalid data provided"
                    });
                }
            }

        }
    }).catch(err => {
        res.status(500).send({
            message: "Couldn't search for the user: " + err
        });
    });
}

// Find specific user
module.exports.findUser = (req, res, next) => {
    let id = req.params.id; // ud given in the url. ex: http://website.com/users/find/:id
    User.findById(id).then((user) => {
            if (!user) {
                res.status(404).send({
                    message: "User not found"
                })
            } else {
                res.send(user);
            }
        })
        .catch(err => {
            console.log(err);
            res.status(500).send({
                message: "Couldn't find user" + err
            });
        });
}

// Find a specific user with username
module.exports.findUsername = (req, res, next) => {
    let username = req.params.username;
    User.findOne({
        username: username
    }).then(user => {
        if (!user) {
            res.status(404).send({
                message: "User not found"
            })
        } else {
            res.status(200).send(user);
        }
    })
}

// Search for a user
module.exports.search = (req, res, next) => {
    // http://website.com/users/search/:username
    let username = req.params.username;
    User.find({
            $or: [{
                    fullname: {
                        $regex: new RegExp(username + '.*', 'i')
                    }
                },
                {
                    username: {
                        $regex: new RegExp(username + '.*', 'i')
                    }
                }
            ]
        })
        .limit(5)
        .select('username fullname email')
        .then(users => {
            res.send(users);
        })
}

// Edit user's data
module.exports.editUser = (req, res, next) => {
    let userId = req.params.userId;
    console.log(userId);

    let ops = req.body;

    console.log(ops);
    if (ops.hasOwnProperty('password')) {
        // let currentPassword;
        console.log('password', bcrypt.hashSync('123123', 10));
        User.findById(userId)
            .select('password')
            .then(user => {
                bcrypt.compare(ops.currentPassword, user.password).then(same => {
                    if (same == false) {
                        console.log('not the same');
                        return res.status(403).send({
                            message: "Wrong password entered!"
                        });
                    } else {
                        ops.password = bcrypt.hashSync(ops.password, 10);
                        User.findOneAndUpdate({
                                _id: userId
                            }, ops).then(() => {
                                User.findOne({
                                        _id: userId
                                    }).then((data) => {
                                        if (!data) {
                                            res.status(500).send({
                                                message: "Couldn't find the updated user: " + err
                                            });
                                        } else {
                                            data.id = data._id;
                                            res.status(200).send(data);
                                        }
                                    })
                                    .catch(err => {
                                        res.status(500).send({
                                            message: "Couldn't find the updated user: " + err
                                        });
                                    })
                            })
                            .catch(err => {
                                res.status(500).send({
                                    message: "Couldn't find or update user: " + err
                                })
                            })
                    }
                })
            })
    } else {
        User.findOneAndUpdate({
                _id: userId
            }, ops).then(() => {
                User.findOne({
                        _id: userId
                    }).then((data) => {
                        if (!data) {
                            res.status(500).send({
                                message: "Couldn't find the updated user: " + err
                            });
                        } else {
                            data.id = data._id;
                            res.status(200).send(data);
                        }
                    })
                    .catch(err => {
                        res.status(500).send({
                            message: "Couldn't find the updated user: " + err
                        });
                    })
            })
            .catch(err => {
                res.status(500).send({
                    message: "Couldn't find or update user: " + err
                })
            })
    }
}

// Send the forget code to the user
module.exports.sendForget = (req, res, next) => {
    let key = shortid.generate();

    Date.prototype.addHours = function (h) {
        this.setTime(this.getTime() + (h * 60 * 60 * 1000));
        return this;
    }

    let expireDate = new Date().addHours(24);

    User.findOneAndUpdate({
        email: req.body.email
    }, {
        $push: {
            "passwordReset": {
                key: key,
                expiresIn: expireDate
            }
        }
    }).then(doc => {
        User.findOne({
            email: req.body.email
        }).then(user => {
            mailController.forget(doc);
            res.status(200).send({
                message: "Code sent to user's email"
            })
        }).catch(err => {
            res.status(500).send({
                message: err
            });
        })

    }).catch(err => {
        res.status(500).send({
            message: err
        });
    })
}

module.exports.getLoginHistory = (req, res, next) => {
    let id = req.user._id;

    User.findById(id).select('loginHistory').then(history => {
        res.status(200).send({
            history: history
        });
    }).catch(err => {
        console.log(err);
        res.status(500).send({
            message: err
        });
    })
}

module.exports.getAvatar = (req, res, next) => {
    let id = req.params.id;
    res.sendFile(`/uploads/profile-picures/${id}`);
}