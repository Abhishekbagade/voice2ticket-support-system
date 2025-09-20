import json
import boto3
import os
import urllib.parse
import uuid

s3_client = boto3.client('s3')
transcribe_client = boto3.client('transcribe')

SUPPORTED_FORMATS = ['.mp3', '.wav', '.mp4']

def lambda_handler(event, context):
    try:
        # Extract S3 bucket & key from event
        record = event['Records'][0]
        bucket_name = record['s3']['bucket']['name']
        key = urllib.parse.unquote_plus(record['s3']['object']['key'])
        
        # Validate file format
        file_extension = os.path.splitext(key)[1].lower()
        if file_extension not in SUPPORTED_FORMATS:
            print(f"Skipping unsupported file format: {key}")
            return {
                'statusCode': 400,
                'body': f"Unsupported file format: {file_extension}"
            }
        
        # Create Transcribe job name
        job_name = f"transcribe-{uuid.uuid4()}"
        file_uri = f"s3://{bucket_name}/{key}"
        
        # Output bucket for transcripts
        transcripts_bucket = os.environ.get('TRANSCRIPTS_BUCKET')
        if not transcripts_bucket:
            raise ValueError("TRANSCRIPTS_BUCKET environment variable not set")
        
        # Start transcription job
        print(f"Starting transcription for: {file_uri}")
        transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': file_uri},
            MediaFormat=file_extension.replace('.', ''),
            LanguageCode='en-US',
            OutputBucketName=transcripts_bucket
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps(f"Transcription job started: {job_name}")
        }
    
    except KeyError as e:
        print(f"Missing key in event: {e}")
        return {
            'statusCode': 400,
            'body': f"Invalid event structure: {str(e)}"
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': str(e)
        }
