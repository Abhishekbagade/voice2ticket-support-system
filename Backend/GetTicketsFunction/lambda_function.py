import json
import boto3
import os

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('Voice2Ticket-Tickets')

def lambda_handler(event, context):
    try:
        # Get query parameters
        department = event.get('queryStringParameters', {}).get('department')
        status = event.get('queryStringParameters', {}).get('status')
        
        # Build scan parameters
        filter_expressions = []
        expression_attrs = {}
        
        if department:
            filter_expressions.append("department = :dept")
            expression_attrs[":dept"] = department
            
        if status:
            filter_expressions.append("#status = :stat")
            expression_attrs[":stat"] = status
            expression_attrs["#status"] = "status"  # For reserved word
        
        # Combine filters
        if filter_expressions:
            filter_expression = " AND ".join(filter_expressions)
        else:
            filter_expression = None
        
        # Scan table
        if filter_expression:
            response = table.scan(
                FilterExpression=filter_expression,
                ExpressionAttributeValues=expression_attrs,
                ExpressionAttributeNames=expression_attrs.get("#status") and {"#status": "status"} or None
            )
        else:
            response = table.scan()
        
        tickets = response.get('Items', [])
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(tickets)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }