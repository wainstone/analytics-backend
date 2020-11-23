import boto3 
import os


def _parse_template(template, cloudformation):
    with open(template) as template_fileobj:
        template_data = template_fileobj.read()
    cloudformation.validate_template(TemplateBody=template_data)
    return template_data


def main():
    stackName = 'athlytics-jy75'
    cloudformation = boto3.client('cloudformation')
    
    templateBody = _parse_template(os.getcwd() + "/cf_backend.yaml", cloudformation)

    print('Attempting to create stack...')
    try: 
        cloudformation.create_stack(StackName=stackName, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'])
    except Exception as e:
        if 'already exists' in str(e):
            print('The stack already existed. Updating...')
            cloudformation.update_stack(StackName=stackName, TemplateBody=templateBody, Capabilities=['CAPABILITY_IAM'])            

if __name__ == "__main__":
    main()