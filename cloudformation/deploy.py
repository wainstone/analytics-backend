import boto3 
import os
import argparse
from time import sleep


def _parse_template(template, cloudformation):
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
            
            if ('COMPLETE' or 'FAILED') not in status:
                print("Stack creation in progress. Status: " + status)
            else:
                print("Stack creation finished with status: " + status)
                break

def main():

    parser = argparse.ArgumentParser(description='Process deployment arguments.')
    parser.add_argument('--env', type=str, default="prod", help='The environment to deploy the stack to.')
    args = parser.parse_args()

    stackName = 'athlytics-jy75-' + args.env
    cf_client = boto3.client('cloudformation')
    
    templateBody = _parse_template(os.getcwd() + "/cf_backend.yaml", cf_client)

    print('Attempting to create stack...')
    try: 
        cf_client.create_stack(StackName=stackName, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'], Parameters=[{"ParameterKey": "Environment", "ParameterValue": args.env}])
        watchStack(cf_client, stackName)
    except Exception as e:
        if 'already exists' in str(e):
            print('The stack already existed. Updating...')
            try:
                cf_client.update_stack(StackName=stackName, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'], Parameters=[{"ParameterKey": "Environment", "ParameterValue": args.env}])   
                watchStack(cf_client, stackName)  
            except Exception as e:
                if 'No updates are to be performed' in str(e):
                    print("The provided template is the same; no updates were performed.")
                else:
                    print(e)
        else:
            print(e)
                   

if __name__ == "__main__":
    main()