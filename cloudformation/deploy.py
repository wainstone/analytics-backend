import boto3 
import os
import argparse
from time import sleep
import yaml
from jinja2 import Template 
import zipfile 
import zlib

BACKEND_TEMPLATE = "./cf_backend_template.yaml"
RENDERED_BACKEND_TEMPLATE = "./rendered_cf_backend.yaml"
LAMBDA_TEMPLATE = "./lambda/lambda_function_template.yaml"
PROJECT_PREFIX = "athlytics-jy75"
LAMBDA_BUCKET_PREFIX = PROJECT_PREFIX + "-lambdas"
REGION = "ca-central-1"


def parse_template(template, cloudformation):
    with open(template) as template_fileobj:
        template_data = template_fileobj.read()
    cloudformation.validate_template(TemplateBody=template_data)
    return template_data

def watchStack(cf_client, stackName):
    while True:
        sleep(2)

        stacks = cf_client.describe_stacks(StackName=stackName)['Stacks']
        
        if len(stacks) == 0:
            print("Stack with name " + stackName + " not found. Retrying...")
        else:
            stack = stacks[0]
            status = stack['StackStatus']
            
            if ('COMPLETE' or 'FAILED') not in status or 'PROGRESS' in status:
                print("Stack creation in progress. Status: " + status)
            else:
                print("Stack creation finished with status: " + status)
                break

def createLambdaBucket(env, lambda_bucket):
    s3_client = boto3.client("s3", region_name=REGION)
    location = {'LocationConstraint': REGION}
    s3_client.create_bucket(Bucket=lambda_bucket, CreateBucketConfiguration=location)

def emptyLambdaBucket(lambda_bucket):
    s3_resource = boto3.resource('s3')
    bucket = s3_resource.Bucket(lambda_bucket)
    bucket.objects.all().delete()

def createLambdas(env, lambda_bucket):
    # List of each Lambda's rendered yaml 
    lambda_list = []

    # Properties dictionary to hold information for each lambda function 
    handlePost = {
        "env": env,
        "s3_bucket": lambda_bucket,
        "s3_key": buildLambdaKey("./lambda/handlePost/index.js", "handlePost"),
        "lambda_name": "handlePost",
        "http_method": "POST",
        "api_resource": "athletesApiResource"
    }

    handleGet = {
        "env": env,
        "s3_bucket": lambda_bucket,
        "s3_key": buildLambdaKey("./lambda/handleGet/index.js", "handleGet"),
        "lambda_name": "handleGet",
        "http_method": "GET",
        "api_resource": "athletesApiResource"
    }

    handleAdminInsert = {
        "env": env,
        "s3_bucket": lambda_bucket,
        "s3_key": buildLambdaKey("./lambda/handleAdminInsert/index.js", "handleAdminInsert"),
        "lambda_name": "handleAdminInsert",
        "http_method": "ANY",
        "api_resource": "adminApiResource"
    }

    lambda_list.append({ "yaml": buildLambda(handleGet), "properties": handleGet})
    lambda_list.append({ "yaml": buildLambda(handlePost), "properties": handlePost})
    lambda_list.append({ "yaml": buildLambda(handleAdminInsert), "properties": handleAdminInsert})        

    appendLambdas(list(map(lambda x: x["yaml"], lambda_list)))

    try:
        uploadLambas(lambda_list, lambda_bucket)
    except:
        raise
    
# Needed for Lambda to pull new code after changes
def buildLambdaKey(path, name):
    with open(path) as f:
        crc = zlib.crc32(bytes(f.read(), 'utf-8'))
        return name + "-" + str(crc)

def uploadLambas(lambda_list, lambda_bucket):
    print("Uploading Lambdas to " + lambda_bucket)
    for l in lambda_list:
        name = l["properties"]["lambda_name"]

        with zipfile.ZipFile('./lambda/' + name + '.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write('lambda/' + name + "/index.js", "index.js")

        try:
            uploadLambdaZip('./lambda/' + name + '.zip', l["properties"]["s3_key"], lambda_bucket)
        except:
            raise

# Uploads Lambda zips to the specified bucket
def uploadLambdaZip(path, s3_key, lambda_bucket):
    s3_client = boto3.client("s3")
    try:
        s3_client.upload_file(path, lambda_bucket, s3_key)
    except:
        raise

      
# Uses a property dictionary render a new Lambda function as CloudFormation
def buildLambda(lambda_properties):            
    with open(LAMBDA_TEMPLATE, "rb") as yamlfile:
        template_string = yamlfile.read()
        template = Template(template_string.decode("UTF-8"))
        rendered = template.render(lambda_properties)
        return yaml.safe_load(rendered)
    

# appendLambdas will append the rendered lambda cloudformation files to the actual backend template 
def appendLambdas(lambdaYaml_list):
    print("Appending Lambdas to CloudFormation...")
    with open(BACKEND_TEMPLATE, "r") as yamlfile:
        curr_yaml = yaml.safe_load(yamlfile)

        # Append each Lambda yaml
        for y in lambdaYaml_list:
            curr_yaml["Resources"].update(y)
    
    with open(RENDERED_BACKEND_TEMPLATE, "w") as yamlfile:
        yaml.safe_dump(curr_yaml, yamlfile)
        
def deployStack(cf_client, stack_name, templateBody, parameters):
    print('Attempting to create stack...')
    try: 
        cf_client.create_stack(StackName=stack_name, TemplateBody=templateBody, Capabilities=['CAPABILITY_NAMED_IAM'], Parameters=parameters)
        watchStack(cf_client, stack_name)
    except Exception as e:
        if 'already exists' in str(e):
            print('The stack already existed. Updating...')
            try:
                cf_client.update_stack(StackName=stack_name, TemplateBody=templateBody, Capabilities=['CAPABILITY_NAMED_IAM'], Parameters=parameters)   
                watchStack(cf_client, stack_name)  
            except Exception as e:
                if 'No updates are to be performed' in str(e):
                    print("The provided template is the same; no updates were performed.")
                else:
                    print(e)
        else:
            print(e)

def main():


    parser = argparse.ArgumentParser(description='Process deployment arguments.')
    parser.add_argument('--env', type=str, required=True, help='The environment to deploy the stack to. Choose your name if unsure.')
    args = parser.parse_args()

    # Create bucket to hold lambda functions 
    lambda_bucket = LAMBDA_BUCKET_PREFIX + "-" + args.env
    try:
        createLambdaBucket(args.env, lambda_bucket)
    except Exception as e:
        if "BucketAlreadyOwnedByYou" in str(e):
            # Empty the previous functions in the bucket
            emptyLambdaBucket(lambda_bucket)
        else:
            print(e)
            exit(1)

    # Create Lambda CloudFormation and upload the code 
    try:
        createLambdas(args.env, lambda_bucket)
    except Exception as e:
        print(e)
        exit(1)

    stack_name = PROJECT_PREFIX + '-' + args.env
    cf_client = boto3.client('cloudformation')
    
    templateBody = parse_template(RENDERED_BACKEND_TEMPLATE, cf_client)

    # Do a two stage deployment to first create the base api and other resources
    parameters = [
                {"ParameterKey": "Environment", "ParameterValue": args.env},
                {"ParameterKey": "ApiReadyToDeploy", "ParameterValue": "false"},
                {"ParameterKey": "LambdaBucketName", "ParameterValue": lambda_bucket}]
    deployStack(cf_client, stack_name, templateBody, parameters)

    # Now create the API methods and deploy it
    print("Lambda functions created, now deploying with respective API methods.")
    parameters[1]["ParameterValue"] = "true"
    deployStack(cf_client, stack_name, templateBody, parameters)


if __name__ == "__main__":
    main()