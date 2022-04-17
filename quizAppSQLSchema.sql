CREATE TABLE `Accounts` (
`id` int PRIMARY KEY AUTO_INCREMENT,
`username` varchar(255),
`password` varchar(255)
);

CREATE TABLE `Quizzes` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `quizname` text,
  `difficulty` text,
  `created_by_userid` int
);

CREATE TABLE `Questions` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `quizid` int,
  `question` text
);

CREATE TABLE `Question_Options` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `questionid` int,
  `questiontext` text,
  `iscorrect` boolean
);

CREATE TABLE `Quiz_User_Answers` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userid` int,
  `quizid` int, 
  `score` int


);

ALTER TABLE `Quizzes` ADD FOREIGN KEY (`created_by_userid`) REFERENCES `Accounts` (`id`) ON DELETE CASCADE;

ALTER TABLE `Questions` ADD FOREIGN KEY (`quizid`) REFERENCES `Quizzes` (`id`) ON DELETE CASCADE;

ALTER TABLE `Question_Options` ADD FOREIGN KEY (`questionid`) REFERENCES `Questions` (`id`) ON DELETE CASCADE;

ALTER TABLE `Quiz_User_Answers` ADD FOREIGN KEY (`userid`) REFERENCES `Accounts` (`id`) ON DELETE CASCADE;

-- This will delete the score record if the quiz is deleted

ALTER TABLE `Quiz_User_Answers` ADD FOREIGN KEY (`quizid`) REFERENCES `Quizzes` (`id`) ON DELETE CASCADE; 

-- Alternatively If we want users to keep scores from deleted quizzes

-- ALTER TABLE `quiz_user_answers` ADD FOREIGN KEY (`quizid`) REFERENCES `Quizzes` (`id`) ON DELETE NO ACTION;


