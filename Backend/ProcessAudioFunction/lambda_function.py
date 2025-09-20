import boto3
import os

transcribe = boto3.client('transcribe')
s3 = boto3.client('s3')

def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    job_name = f"transcribe-{key.replace('/', '-')}"
    
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': f"s3://{bucket}/{key}"},
        MediaFormat=key.split('.')[-1],
        LanguageCode='en-US',
        OutputBucketName=os.environ['AUDIO_BUCKET'],
        Settings={
            'ShowSpeakerLabels': True,
            'MaxSpeakerLabels': 2
        }
    )
    
    return {'statusCode': 200}