# quizapp-backend


1. You are going to want to run the SQL schema in a database and it will construct all the fields you need. 

IMPORTANT: You are also going to need to modify the .env to have a much more secure (ideally hashed) JWT secret

2. You will need to reconfigure the .env file in the /src directory to your database configuration details.

3. Inside src\server.js customise the limiter constant to include the desired values 

4. Deploy server.js by going \quizapp-backend\src\server and run 'node server.js'
