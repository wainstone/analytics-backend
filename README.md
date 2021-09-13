# analytics-backend

Backend repository for AWS infra-as-code for Athlytics UBC capstone project.

## Deployment
```
cd cloudformation
python deploy.py --env <your environment here>
```

Ex: 
`python deploy.py --env dev`

### How it works
The script performs the following in order
1. Create Lambda function bucket
2. Lambda functions are Zipped and uploaded to the bucket
3. CloudFormation is deployed in two stages:
  - Stage 1:
    - DB table
    - lambda functions
    - API gateway
      - athletes resource
      - admin resource
      - options methods for CORS
  - Stage 2:
    - All of the above 
    - API gateway
      - deployment
      - stage

The reason for two stages is that CloudFormation defaults to generating resources in parallel and since the Lambda CloudFormation is generated dynamically, it can't be referenced as a dependency by some of the API gateway resources. 

## Deletion 
- Delete the CloudFormation stack
- Delete the Lambda bucket
- Delete the DynamoDB table (is a part of the stack but has deletion protection)
