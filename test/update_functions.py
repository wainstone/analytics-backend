import boto3
from os import listdir
from os.path import isfile, join
from os import walk
import glob 


def main():
    print("Updating lambda functions")

    lambda_client = boto3.client('lambda')


    # Each directory is lambda function
    for func in list(filter(lambda x: not isfile(join("./", x)), listdir())):
        print(func + "/index.js")
        lambda_client.create_function(FunctionName=func)

    # res = lambda_client.list_functions( FunctionVersion="ALL")
    # print(list(map(lambda x: x['FunctionArn'], res['Functions'])))

if __name__ == "__main__":
  main()