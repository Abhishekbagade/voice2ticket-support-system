import boto3
import json
import os

transcribe = boto3.client('transcribe')
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')

def classify_text(text):
    it_keywords = ['laptop', 'wifi', 'email', 'password', 'vpn', 'system']
    hr_keywords = ['vacation', 'leave', 'benefits', 'contact', 'insurance']
    admin_keywords = ['printer', 'room', 'booking', 'facilities', 'air conditioning']
    
    it_count = sum(1 for word in it_keywords if word in text.lower())
    hr_count = sum(1 for word in hr_keywords if word in text.lower())
    admin_count = sum(1 for word in admin_keywords if word in text.lower())
    
    counts = {
        'IT': it_count,
        'HR': hr_count,
        'Admin': admin_count
    }
    
    return max(counts, key=counts.get)

def lambda_handler(event, context):
    jobs = transcribe.list_transcription_jobs(Status='COMPLETED')['TranscriptionJobSummaries']
    
    for job in jobs:
        job_name = job['TranscriptionJobName']
        job_detail = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        transcript_uri = job_detail['TranscriptionJob']['Transcript']['TranscriptFileUri']
        
        # Download and parse transcript
        # ... (implementation omitted for brevity)
        
        department = classify_text(transcript_text)
        
        # Save to DynamoDB
        table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])
        table.put_item(Item={
            'ticketId': f"TKT-{int(time.time())}",
            'transcribedText': transcript_text,
            'department': department,
            'status': 'Open',
            # ... other fields
        })
        
        # Send SNS notification
        sns.publish(
            TopicArn=os.environ[f"{department.upper()}_SNS_TOPIC"],
            Message=f"New ticket created in {department} department"
        )
        
        # Delete processed job
        transcribe.delete_transcription_job(TranscriptionJobName=job_name)
    
    return {'statusCode': 200}