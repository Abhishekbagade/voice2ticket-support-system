import boto3
import os
from datetime import datetime, timedelta
import json

# Initialize AWS services
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')
table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])  # Get table name from env variable

def lambda_handler(event, context):
    # Calculate cutoff time (7 days ago)
    cutoff_time = (datetime.utcnow() - timedelta(days=7)).isoformat()
    
    # Scan for inactive tickets
    response = table.scan(
        FilterExpression="lastUpdated < :cutoff AND (status = :open OR status = :inprogress)",
        ExpressionAttributeValues={
            ":cutoff": cutoff_time,
            ":open": "Open",
            ":inprogress": "In Progress"
        }
    )
    
    closed_tickets = []
    for ticket in response['Items']:
        try:
            # Update ticket status
            response = table.update_item(
                Key={'ticketId': ticket['ticketId']},
                UpdateExpression="SET #status = :closed, resolution = :resolution",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":closed": "Closed",
                    ":resolution": f"Automatically closed due to inactivity (last updated {ticket['lastUpdated']})"
                },
                ReturnValues="UPDATED_NEW"
            )
            
            # Add to closed tickets list
            closed_tickets.append({
                'ticketId': ticket['ticketId'],
                'user': ticket['userInfo']['name'],
                'department': ticket['department'],
                'lastUpdated': ticket['lastUpdated']
            })
            
        except Exception as e:
            print(f"Error closing ticket {ticket['ticketId']}: {str(e)}")
    
    # Send summary notification
    if closed_tickets:
        message = f"Auto-closed {len(closed_tickets)} inactive tickets:\n\n"
        message += "\n".join([
            f"- {t['ticketId']} ({t['department']}) - Last updated: {t['lastUpdated']}"
            for t in closed_tickets
        ])
        
        sns.publish(
            TopicArn=os.environ['ADMIN_SNS_TOPIC'],
            Subject=f"Auto-closed {len(closed_tickets)} tickets",
            Message=message
        )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'closed_tickets': len(closed_tickets),
            'message': 'Auto-close completed successfully'
        })
    }