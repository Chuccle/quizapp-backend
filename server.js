const connection = require('./db.js')
const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const cookieParser = require('cookie-parser');


const rateLimit = require('express-rate-limit').default //.default is needed to get this to work

const origins = ['https://quiz-app-orpin-beta.vercel.app', 'https://quiz-app-git-master-chuccle.vercel.app', 'https://quiz-app-chuccle.vercel.app']

const corsOptions = {
  origin: origins,

  //https://quiz-app-git-refreshtokentest-chuccle.vercel.app
  //for prod: https://quiz-app-chuccle.vercel.app/

  credentials: true
}

app.use(cors(corsOptions))


const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 1000, // Limit each IP to 50 requests per `window` (here, per 1 minutes)
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});



require('dotenv').config({
  path: './src/.env'
})

app.use(limiter);

app.use(bodyParser.json())

app.use(cookieParser())


app.delete('/logout', (req, res) => {

  res.clearCookie('session_token', { sameSite: 'none', httpOnly: true, secure: true })
  res.status(200).send({ message: 'logged out' })

})

app.get('/auth', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]
  // asynchronously check if our tokeb is valid and return the user id in data property of result
  jwt.verify(accessToken, process.env.JWT_SECRET, function (err, result) {


    if (result) {

      res.send({
        message: 'token is valid',
      })


    } else {

      res.status(401).json({
        error: 'invalid token'
      })

    }

  })

});



app.get('/silentrefresh', (req, res) => {

  // We split the Authorisation header into 2 parts, the Bearer part and the token and extract the token
  const accessToken = req.headers.authorization.split(' ')[1]


  // asynchronously check if our token is valid and return the user id in data property of result
  jwt.verify(accessToken, process.env.JWT_SECRET, function (err, result) {


    if (result) {

      res.send({
        message: 'token is valid',
      })



    } else if (err.message == 'jwt expired') {

      // if token is expired, we need to refresh it

      jwt.verify(req.cookies.session_token, process.env.COOKIE_SECRET, function (err, result) {

        if (result) {

          // if the cookie is valid, we can refresh the token
          let newToken = jwt.sign({
            data: result.data
          }, process.env.JWT_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_LIFE
          })



          res.send({
            token: newToken
          });

        } else {

          res.status(401).json({
            error: 'invalid token'
          })


        }

      })


    } else {

      // if the token is invalid for reasons other than expiry, we need to respond with error
      res.status(401).json({
        error: err
      });

    };

  });

});


app.get('/quizzes/:page', (req, res) => {


  const accessToken = req.headers.authorization.split(' ')[1]

  // asynchronously check if our tokeb is valid and return the user id in data property of result

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });

    }

    // offset is how many results the page is designed to display
    const extractedCurrentPage = req.params.page.split('=')[1];

    const offset = extractedCurrentPage * 6;

    connection.query('SELECT username FROM Accounts WHERE id = ?',
      [tokenResult.data],
      function (selectUsernameError, selectUsernameResult) {

        if (selectUsernameError) throw res.send({
          error: selectUsernameError
        });


        connection.query('SELECT Quizzes.id, Quizzes.quizname, Quizzes.difficulty, Quiz_User_Answers.score FROM Quizzes LEFT JOIN Quiz_User_Answers ON Quiz_User_Answers.quizid = Quizzes.id AND Quiz_User_Answers.userid = ? LIMIT ? , 6',
          [tokenResult.data, offset],
          function (selectQuizzesError, selectQuizzesResult) {

            if (selectQuizzesError) throw res.send({
              error: selectQuizzesError
            });

            connection.query('SELECT COUNT(*) As count FROM Quizzes;', function (selectQuizCountError, selectQuizCountResult) {
              if (selectQuizCountError) throw res.send({
                error: selectQuizCountError
              });


              res.send({
                results: selectQuizzesResult,
                name: selectUsernameResult,
                quizcount: selectQuizCountResult
              });

            });

          });

      });

  });

});


app.post('/login', (req, res) => {

  // ? characters in query represent escaped placeholders for our username and password 

  connection.query('SELECT * FROM Accounts WHERE username = ?', [req.body.username], function (selectUserRecordError, selectUserRecordResults) {

    if (selectUserRecordError) throw res.send({
      error: selectUserRecordError
    });

    // Getting the 'response' from the database and sending it to our route. This is were the data is.

    if (selectUserRecordResults.length > 0) {

      bcrypt.compare(req.body.password, selectUserRecordResults[0].password, function (passwordCompareErr, passwordCompareResult) {

        if (passwordCompareResult) {

          //signing our token to send to client
          //we use primary key of our record as it guaranatees a unique identifier of the record

          let token = jwt.sign({
            data: selectUserRecordResults[0].id
          }, process.env.JWT_SECRET, {
            expiresIn: process.env.ACCESS_TOKEN_LIFE
          })

          let refreshToken = jwt.sign({
            data: selectUserRecordResults[0].id
          }, process.env.COOKIE_SECRET, {
            expiresIn: process.env.REFRESH_TOKEN_LIFE
          })

          let sevendaymillis = 7 * 24 * 60 * 60 * 1000;

          //sending our token response back to the client

          res.cookie('session_token', refreshToken, { sameSite: 'none', httpOnly: true, maxAge: sevendaymillis, secure: true });              //sending our token response back to the client

          res.send({
            token: token
          });


        } else {

          res.send({
            error: passwordCompareErr
          });

        };

      });

    };

  });

});


app.post('/register', (req, res) => {

  // ? characters in query represent escaped placeholders for our username and password 

  // first we look for any duplicate usernames with the table

  connection.query('SELECT * FROM Accounts WHERE username = ?', [req.body.username], function (selectUserRecordError, selectUserRecordResults) {
    if (selectUserRecordError) throw res.send({
      error: selectUserRecordError
    });

    // If usernames aren't conflicting, hash password and create new record with supplied data

    if (selectUserRecordResults.length === 0) {

      bcrypt.hash(req.body.password, 10, function (hasherr, hash) {

        if (hash) {


          connection.query('INSERT INTO Accounts (username, password) VALUES (?, ?);', [req.body.username, hash], function (InsertUserError, InsertUserResults) {

            // Getting the 'response' from the database and sending it to our route. This is were the data is.

            if (InsertUserError) throw res.send({
              error: InsertUserError
            });

            let accessToken = jwt.sign({
              data: InsertUserResults.insertId
            }, process.env.JWT_SECRET, {
              expiresIn: process.env.ACCESS_TOKEN_LIFE
            })

            let refreshToken = jwt.sign({
              data: InsertUserResults.insertId
            }, process.env.JWT_SECRET, {
              expiresIn: process.env.REFRESH_TOKEN_LIFE
            })

            let sevendaymillis = 7 * 24 * 60 * 60 * 1000;

            res.cookie('session_token', refreshToken, { sameSite: 'none', httpOnly: true, maxAge: sevendaymillis, secure: true });

            res.send({
              token: accessToken
            })

          });

        } else {

          res.send({
            error: hasherr
          });

        }

      })

    } else {

      res.send({
        error: "username already exists"
      });

    };

  });

});


app.post('/quiz', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenSuccess) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });


      connection.query('INSERT INTO Quizzes (quizname, created_by_userid, difficulty) VALUES (?, ?, ?);',
        [req.body.questionset[0].Quizname, tokenSuccess.data, req.body.questionset[0].Difficulty], function (insertQuizError, insertQuizResults) {

          if (insertQuizError) throw res.send({
            error: insertQuizError
          });

          req.body.questionset.forEach(questiondata => {

            connection.query('INSERT INTO Questions (quizid, question) VALUES (?, ?);', [insertQuizResults.insertId, questiondata.Questionset.Questionname],
              function (insertQuestionsError, insertQuestionsResults) {

                if (insertQuestionsError) throw res.send({
                  error: insertQuestionsError
                });

                let sql = "INSERT INTO Question_Options(questionid, questiontext, iscorrect) VALUES ?";

                let values = [
                  [insertQuestionsResults.insertId, questiondata.Questionset.Options.Incorrect1, 0],
                  [insertQuestionsResults.insertId, questiondata.Questionset.Options.Incorrect2, 0],
                  [insertQuestionsResults.insertId, questiondata.Questionset.Options.Incorrect3, 0],
                  [insertQuestionsResults.insertId, questiondata.Questionset.Options.Correct, 1]
                ];

                // find a way of bulk inserting the entire set of options with 2d arraylist? done!

                connection.query(sql, [values], function (insertQuestionsetError) {

                  if (insertQuestionsetError) throw res.send({
                    error: insertQuestionsetError

                  });

                });

              });

          });

          res.send({
            QuizStatus: "Inserted"
          });

        });

    };

  });

});


app.get('/questions/:quizid', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET);

  const extractedQuizID = req.params.quizid.split('=')[1];

  const questionqueue = [];

  connection.query('SELECT * FROM Questions WHERE quizid = ?', [extractedQuizID], function (selectQuestionRecordsError, selectQuestionRecordsResults) {

    if (selectQuestionRecordsError) throw res.send({
      error: selectQuestionRecordsError
    });

    for (let i = 0; i < selectQuestionRecordsResults.length; i++) {

      connection.query('SELECT * FROM Question_Options WHERE questionid = ? AND iscorrect = 1', [selectQuestionRecordsResults[i].id], function (selectCorrectOptionRecordError, CorrectOptionRecordResults) {

        if (selectCorrectOptionRecordError) throw res.send({
          error: selectCorrectOptionRecordError
        });

        connection.query('SELECT * FROM Question_Options WHERE questionid = ? AND iscorrect = 0', [selectQuestionRecordsResults[i].id], function (selectIncorrectOptionsRecordError, IncorrectOptionRecordResults) {

          if (selectCorrectOptionRecordError) throw res.send({
            error: selectIncorrectOptionsRecordError
          });

          const questiondata = {

            Questionid: selectQuestionRecordsResults[i].id,
            Questiontext: selectQuestionRecordsResults[i].question,
            Options: {
              Correctid: CorrectOptionRecordResults[0].id,
              Correct: CorrectOptionRecordResults[0].questiontext,
              Incorrect1id: IncorrectOptionRecordResults[0].id,
              Incorrect1: IncorrectOptionRecordResults[0].questiontext,
              Incorrect2id: IncorrectOptionRecordResults[1].id,
              Incorrect2: IncorrectOptionRecordResults[1].questiontext,
              Incorrect3id: IncorrectOptionRecordResults[2].id,
              Incorrect3: IncorrectOptionRecordResults[2].questiontext,
            }

          }

          questionqueue.push(questiondata);

          // inefficient, runs every iteration


          if (i === selectQuestionRecordsResults.length - 1) {

            res.send({
              Questions: questionqueue
            });

          };

        });

      });

    };

  });

});

app.post('/results', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });
    }

    connection.query('SELECT * FROM Quiz_User_Answers WHERE userid = ? And quizid = ?', [tokenResult.data, req.body.quizid], function (selectUserQuizDataError, selectUserQuizDataResults) {

      if (selectUserQuizDataError) throw res.send({
        error: selectUserQuizDataError
      });


      if (selectUserQuizDataResults.length === 0) {


        connection.query('INSERT INTO Quiz_User_Answers(userid, quizid, score) values (?,?,?)', [tokenResult.data, req.body.quizid, req.body.results], function (insertUserQuizDataError, _insertUserQuizDataResults) {

          if (insertUserQuizDataError) throw res.send({
            error: insertUserQuizDataError


          });
        });

      } else {

        if (selectUserQuizDataResults[0].score < req.body.results) {
          //by using update we can reduce the amount of records overall, the alternative is multiple records with different scores
          connection.query('UPDATE Quiz_User_Answers SET score = ? WHERE id = ?', [req.body.results, selectUserQuizDataResults[0].id], function (updateUserQuizDataError, _updateUserQuizDataResults) {

            if (updateUserQuizDataError) throw res.send({
              error: updateUserQuizDataError

            });

          });

        };

      };

    });

    res.send({
      status: "ok"
    });

  });

});

app.get('/leaderboard/:page', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET);

  const extractedCurrentPage = req.params.page.split('=')[1];

  const offset = extractedCurrentPage * 3;

  connection.query('SELECT ROW_NUMBER() OVER ( ORDER BY successfulquizzes DESC ) AS rank, Accounts.id, Accounts.username, COUNT(Quiz_User_Answers.quizid) AS successfulquizzes FROM Accounts INNER JOIN Quiz_User_Answers ON Quiz_User_Answers.userid = Accounts.id WHERE Quiz_User_Answers.score>=80 GROUP BY Accounts.id ORDER BY successfulquizzes DESC  LIMIT ? , 3;', [offset], function (selectQuizScoresError, selectQuizScoresResults) {

    if (selectQuizScoresError) throw res.send({
      error: selectQuizScoresError
    });

    connection.query('SELECT COUNT(*) as count FROM (SELECT ROW_NUMBER() OVER ( ORDER BY successfulquizzes DESC ) AS rank, Accounts.id, Accounts.username, COUNT(Quiz_User_Answers.quizid) AS successfulquizzes FROM Accounts INNER JOIN Quiz_User_Answers ON Quiz_User_Answers.userid = Accounts.id WHERE Quiz_User_Answers.score>=80 GROUP BY Accounts.id ORDER BY successfulquizzes DESC) x;', function (selectTotalLeaderboardCountError, selectTotalLeaderboardCountResult) {

      if (selectTotalLeaderboardCountError) throw res.send({
        error: selectTotalLeaderboardCountError
      });

      res.send({
        results: selectQuizScoresResults,
        leaderboardcount: selectTotalLeaderboardCountResult
      });

    });


  })

});



app.get('/leaderboard/search/:params', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, _tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });
    }

    const rawSearchQuery = req.params.params.split('&')[0];

    const rawCurrentpage = req.params.params.split('&')[1];

    const extractedSearchQuery = rawSearchQuery.split('=')[1];

    const extractedCurrentpage = rawCurrentpage.split('=')[1];

    const offset = extractedCurrentpage * 3;

    connection.query('SELECT * FROM (SELECT ROW_NUMBER() OVER ( ORDER BY successfulquizzes DESC ) AS rank, Accounts.id, Accounts.username, COUNT(Quiz_User_Answers.quizid) AS successfulquizzes FROM Accounts INNER JOIN Quiz_User_Answers ON Quiz_User_Answers.userid = Accounts.id WHERE Quiz_User_Answers.score>=80 GROUP BY Accounts.id ORDER BY successfulquizzes DESC) x WHERE username = ? LIMIT ?, 3', [extractedSearchQuery, offset], function (selectUserPositionError, selectUserPositionResults) {

      if (selectUserPositionError) throw res.send({
        error: selectUserPositionError
      });

      connection.query('SELECT COUNT(*) AS usersearchcount FROM (SELECT * FROM (SELECT ROW_NUMBER() OVER ( ORDER BY successfulquizzes DESC ) AS rank, Accounts.id, Accounts.username, COUNT(Quiz_User_Answers.quizid) AS successfulquizzes FROM Accounts INNER JOIN Quiz_User_Answers ON Quiz_User_Answers.userid = Accounts.id WHERE Quiz_User_Answers.score>=80 GROUP BY Accounts.id ORDER BY successfulquizzes DESC) x WHERE username = ?) x;', [extractedSearchQuery], function (selectUserPositionCountError, selectUserPositionCountResults) {

        if (selectUserPositionCountError) throw res.send({
          error: selectUserPositionCountError
        });

        res.send({
          results: selectUserPositionResults,
          leaderboardcount: selectUserPositionCountResults
        });

      });

    });

  });

});


app.get('/quiz/:params', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {
      res.send({
        error: tokenErr
      });
    }

    const rawSearchQuery = req.params.params.split('&')[0];

    const rawCurrentpage = req.params.params.split('&')[1];

    const extractedSearchQuery = rawSearchQuery.split('=')[1];

    const extractedCurrentpage = rawCurrentpage.split('=')[1];

    const offset = extractedCurrentpage * 6;

    connection.query('SELECT Quizzes.id, Quizzes.quizname, Quizzes.difficulty, Quiz_User_Answers.score FROM Quizzes LEFT JOIN Quiz_User_Answers ON Quiz_User_Answers.quizid = Quizzes.id AND Quiz_User_Answers.userid = ? WHERE Quizzes.quizname = ? LIMIT ?, 6',
      [tokenResult.data, extractedSearchQuery, offset],
      function (selectQuiznameError, selectQuiznameResult) {

        if (selectQuiznameError) throw res.send({
          error: selectQuiznameError

        });

        connection.query('SELECT COUNT(*) AS quizsearchcount FROM (SELECT Quizzes.id, Quizzes.quizname, Quizzes.difficulty, Quiz_User_Answers.score FROM Quizzes LEFT JOIN Quiz_User_Answers ON Quiz_User_Answers.quizid = Quizzes.id AND Quiz_User_Answers.userid = ? WHERE Quizzes.quizname = ?) x',
          [tokenResult.data, extractedSearchQuery],
          function (selectQuiznameCountError, selectQuiznameCountResult) {

            if (selectQuiznameCountError) throw res.send({
              error: selectQuiznameError

            });

            res.send({
              results: selectQuiznameResult,
              quizsearchcount: selectQuiznameCountResult

            });

          });

      });

  });

});

app.get('/userquizzes/:page', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  const extractedCurrentpage = req.params.page.split('=')[1];

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });

    }

    const offset = extractedCurrentpage * 6;

    connection.query('SELECT * FROM Quizzes WHERE created_by_userid = ? LIMIT ?, 6',
      [tokenResult.data, offset],
      function (selectUserQuizzesError, selectUserQuizzesResult) {

        if (selectUserQuizzesError) throw res.send({
          error: selectUserQuizzesError

        });

        connection.query('SELECT COUNT(*) AS quizcount FROM (SELECT quizname and difficulty FROM Quizzes WHERE created_by_userid = ?) x',
          [tokenResult.data],
          function (selectUserQuizCountError, selectUserQuizCountResult) {

            if (selectUserQuizCountError) throw res.send({
              error: selectUserQuizCountError

            });


            res.send({
              results: selectUserQuizzesResult,
              quizsearchcount: selectUserQuizCountResult
            });

          });

      });

  });

});

app.get('/userquizzes/search/:params', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });

    }

    const rawSearchQuery = req.params.params.split('&')[0];

    const rawCurrentpage = req.params.params.split('&')[1];

    const extractedSearchQuery = rawSearchQuery.split('=')[1];

    const extractedCurrentpage = rawCurrentpage.split('=')[1];

    const offset = extractedCurrentpage * 6;

    connection.query('SELECT * FROM Quizzes WHERE created_by_userid = ? AND quizname = ?  LIMIT ?, 6',
      [tokenResult.data, extractedSearchQuery, offset],
      function (selectUserQuizzesError, selectUserQuizzesResult) {

        if (selectUserQuizzesError) throw res.send({
          error: selectUserQuizzesError

        });

        connection.query('SELECT COUNT(*) AS quizcount FROM (SELECT quizname and difficulty FROM Quizzes WHERE created_by_userid = ? AND quizname = ?) x',
          [tokenResult.data, req.body.searchquery],
          function (selectUserQuizCountError, selectUserQuizCountResult) {

            if (selectUserQuizCountError) throw res.send({
              error: selectUserQuizCountError

            });

            res.send({
              results: selectUserQuizzesResult,
              quizsearchcount: selectUserQuizCountResult
            });

          });

      });


  });

});




app.put('/quiz/difficulty', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {
      res.send({
        error: tokenErr
      });
    }

    connection.query('UPDATE Quizzes SET difficulty = ? WHERE id = ? AND created_by_userid = ?;',
      [req.body.optionalData, req.body.key, tokenResult.data],

      function (updateUserQuizDifficultyError, updateUserQuizDifficultyResult) {

        if (updateUserQuizDifficultyError) throw res.send({
          error: updateUserQuizDifficultyError

        });

        res.send({
          results: updateUserQuizDifficultyResult
        });

      });

  });

});


app.put('/quiz/name', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });
    }

    connection.query('UPDATE Quizzes SET quizname = ? WHERE id = ? AND created_by_userid = ?;',
      [req.body.optionalData, req.body.key, tokenResult.data],

      function (updateUserQuizNameError, updateUserQuizNameResult) {

        if (updateUserQuizNameError) throw res.send({
          error: updateUserQuizNameError

        });

        res.send({
          results: updateUserQuizNameResult
        });

      });

  });

});




app.put('/quiz/question', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {
      res.send({
        error: tokenErr
      });

    }


    connection.query('SELECT created_by_userid FROM Quizzes WHERE id = ?;',
      [req.body.quizid],

      function (selectUserIDError, selectUserIDResult) {

        if (selectUserIDError) throw res.send({
          error: selectUserIDError

        });

        if (selectUserIDResult[0].created_by_userid != tokenResult.data) {

          res.send({
            error: "You do not have permission to edit this quiz"
          });

        }


        connection.query('UPDATE Questions SET Question = ? WHERE id = ? AND quizid = ?;',
          [req.body.question, req.body.id, req.body.quizid],

          function (updateUserQuestionNameError, updateUserQuestionNameResult) {

            if (updateUserQuestionNameError) throw res.send({
              error: updateUserQuestionNameError

            });

            res.send({
              results: updateUserQuestionNameResult
            });

          });
      })

  });

});




app.put('/quiz/question/option', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]

  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {
      res.send({
        error: tokenErr
      });

    }

    connection.query('SELECT created_by_userid FROM Quizzes WHERE id = (SELECT quizID FROM Questions WHERE id = ?);',
      [req.body.questionid],

      function (selectUserIDError, selectUserIDResult) {

        if (selectUserIDError) throw res.send({
          error: selectUserIDError

        });


        if (selectUserIDResult[0].created_by_userid != tokenResult.data) {

          res.send({
            error: "You do not have permission to edit this quiz"
          });

        }

        connection.query('UPDATE Question_Options SET questiontext = ? WHERE id = ? AND questionid = ?;',
          [req.body.questiontext, req.body.id, req.body.questionid],

          function (updateUserQuestionOptionError, updateUserQuestionOptionResult) {

            if (updateUserQuestionOptionError) throw res.send({
              error: updateUserQuestionOptionError

            });

            res.send({
              results: updateUserQuestionOptionResult
            });

          });

      })

  });

});


app.delete('/quiz/:quizid', (req, res) => {

  const accessToken = req.headers.authorization.split(' ')[1]
  const quizid = req.params.quizid.split('=')[1];


  jwt.verify(accessToken, process.env.JWT_SECRET, function (tokenErr, tokenResult) {

    if (tokenErr) {

      res.send({
        error: tokenErr
      });
    }

    connection.query('DELETE FROM Quizzes WHERE id = ? AND created_by_userid = ?;',
      [quizid, tokenResult.data],

      function (dropUserQuizzesError, dropUserQuizzesResult) {

        if (dropUserQuizzesError) throw res.send({
          error: dropUserQuizzesError

        });

        res.send({
          results: dropUserQuizzesResult
        });

      });

  });

});