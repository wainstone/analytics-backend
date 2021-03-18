import boto3 
import os
import argparse
from time import sleep
import yaml
from jinja2 import Template 
import zipfile 

BACKEND_TEMPLATE = "./cf_backend_template.yaml"
RENDERED_BACKEND_TEMPLATE = "./rendered_cf_backend.yaml"
LAMBDA_TEMPLATE = "./lambda/lambda_function_template.yaml"
LAMBDA_BUCKET = "athlytics-jy75-lambdas"

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

def createLambdas(env):
    
    # List of each Lambda's rendered yaml 
    lambdaYaml_list = []

    # Properties dictionary to hold information for each lambda function 
    handlePost = {
        "env": env,
        "lambda_name": "handlePost",
        "http_method": "POST",
        "api_resource": "athletesApiResource"
    }

    handleGet = {
        "env": env,
        "lambda_name": "handleGet",
        "http_method": "GET",
        "api_resource": "athletesApiResource"
    }

    handleAdminInsert = {
        "env": env,
        "lambda_name": "handleAdminInsert",
        "http_method": "ANY",
        "api_resource": "adminApiResource"
    }

    # lambdaYaml_list.append(buildLambda(handleGet))
    lambdaYaml_list.append(buildLambda(handlePost))
    # lambdaYaml_list.append(buildLambda(handleAdminInsert))        

    appendLambdas(lambdaYaml_list)

    zipf = zipfile.ZipFile('./lambda/' + handlePost["lambda_name"] + '.zip', 'w', zipfile.ZIP_DEFLATED)
    zipLambda('./lambda/' + handlePost["lambda_name"], zipf)
    zipf.close()

    uploadLambdaZip('./lambda/' + handlePost["lambda_name"] + '.zip', handlePost["lambda_name"])

def zipLambda(path, ziph):
    # ziph is zipfile handle
    for root, dirs, files in os.walk(path):
        for file in files:
            ziph.write(os.path.join(root, file), os.path.relpath(os.path.join(root, file), os.path.join(path, '..')))

def uploadLambdaZip(path, name):
    s3_client = boto3.client("s3")

    try:
        response = s3_client.upload_file(path, LAMBDA_BUCKET, name)
        print(response)
    except Exception as e:
        print(e)

      


# Uses a property dictionary render a new Lambda function as CloudFormation
def buildLambda(lambda_properties):

    with open(os.getcwd() + "/lambda/" + lambda_properties["lambda_name"] + "/index.js", "rb") as code:
            # code_string = code.read()
            # lambda_properties["code"] = code_string.decode("UTF-8")
            lambda_properties["s3_bucket"] = LAMBDA_BUCKET
            lambda_properties["s3_key"] = lambda_properties["lambda_name"]
    with open(LAMBDA_TEMPLATE, "rb") as yamlfile:
            template_string = yamlfile.read()
            template = Template(template_string.decode("UTF-8"))
            rendered = template.render(lambda_properties)
            return yaml.safe_load(rendered)
    

# appendLambdas will append the rendered lambda cloudformation files to the actual backend template 
def appendLambdas(lambdaYaml_list):
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

    # Build lambda functions from their JS files and append to the CF template
    createLambdas(args.env)

    stack_name = 'athlytics-jy75-' + args.env
    cf_client = boto3.client('cloudformation')
    
    templateBody = parse_template(RENDERED_BACKEND_TEMPLATE, cf_client)

    parameters = [
                {"ParameterKey": "Environment", "ParameterValue": args.env},
                {"ParameterKey": "ApiReadyToDeploy", "ParameterValue": "false"}]
    deployStack(cf_client, stack_name, templateBody, parameters)

    print("Lambda functions created, now deploying with respective API methods.")
    parameters[1]["ParameterValue"] = "true"
    deployStack(cf_client, stack_name, templateBody, parameters)


if __name__ == "__main__":
    main()