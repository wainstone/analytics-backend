# analytics-backend

Backend:

- Create Lambda function bucket
- Lambda functions are Zipped and uploaded to the bucket
- CloudFormation is deployed in two stages:

Stage 1:
-- DB table
-- lambda functions
-- API gateway
--- athletes resource
--- admin resource
--- options methods for CORS

Stage 2:
-- All of the above 
-- API gateway
--- deployment
--- stage

Reason for two stage is that CloudFormation defaults to generating resources in parallel and since the Lambda CloudFormation is generated dynamically, it can't be referenced as a dependency by some of the API gateway resources. 

For deployment:
cd cloudformation
python deploy.py --env <your environment here>

Ex: python deploy.py --env dev

For full deletion: 
- Delete the CloudFormation stack
- Delete the Lambda bucket
- Delete the DynamoDB table (is a part of the stack but has deletion protection)