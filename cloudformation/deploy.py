import boto3 
import os
import argparse
from time import sleep
import yaml
from jinja2 import Template 


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

# This function will use the lambda function CF template to create the CloudFormation represenation of each lambda function
def buildLambda():

    template = "./lambda/lambda_function_template.yaml"

    # This will eventually be done through reading the folder names (folder name = function name)
    lambda_properties = {
        "lambda_name": "functionOne"
    }

    new_rendered = "./lambda/rendered_" + lambda_properties["lambda_name"] + ".yaml"

    with open(template, "r") as yamlfile:
        template_string = yamlfile.read()
        print(template_string)
        template = Template(template_string)
        rendered = template.render(lambda_properties)
        print(rendered)

    with open(new_rendered, "w") as output:
        output.write(rendered)

    with open(new_rendered, 'r') as output:
        new_yaml = yaml.safe_load(output)
        appendLambda(new_yaml)

    

# appendLambdas will append the rendered lambda cloudformation files to the actual backend template 
def appendLambda(lambdaYaml):
    backend_cf = "./cf_backend_template.yaml"

    with open(backend_cf, "r") as yamlfile:
        curr_yaml = yaml.safe_load(yamlfile)
        curr_yaml["Resources"].update(lambdaYaml)
    
    with open("./cf_backend.yaml", "w") as yamlfile:
        yaml.safe_dump(curr_yaml, yamlfile)
        
def deployStack(cf_client, stack_name, templateBody, parameters):
    print('Attempting to create stack...')
    try: 
        cf_client.create_stack(StackName=stack_name, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'], Parameters=parameters)
        watchStack(cf_client, stack_name)
    except Exception as e:
        if 'already exists' in str(e):
            print('The stack already existed. Updating...')
            try:
                cf_client.update_stack(StackName=stack_name, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'], Parameters=parameters)   
                watchStack(cf_client, stack_name)  
            except Exception as e:
                if 'No updates are to be performed' in str(e):
                    print("The provided template is the same; no updates were performed.")
                else:
                    print(e)
        else:
            print(e)

def main():

    buildLambda()

    parser = argparse.ArgumentParser(description='Process deployment arguments.')
    parser.add_argument('--env', type=str, required=True, help='The environment to deploy the stack to. Choose your name if unsure.')
    args = parser.parse_args()

    stack_name = 'athlytics-jy75-' + args.env
    cf_client = boto3.client('cloudformation')
    
    templateBody = parse_template(os.getcwd() + "/cf_backend.yaml", cf_client)

    parameters = [
                {"ParameterKey": "Environment", "ParameterValue": args.env},
                {"ParameterKey": "ApiReadyToDeploy", "ParameterValue": "false"}]

    deployStack(cf_client, stack_name, templateBody, parameters)

    parameters[1]["ParameterValue"] = "true"
    deployStack(cf_client, stack_name, templateBody, parameters)


if __name__ == "__main__":
    main()