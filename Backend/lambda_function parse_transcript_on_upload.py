import os
import json
import time
import logging
import boto3
import urllib.parse
from botocore.exceptions import ClientError

# if requests not available, install via layer or package
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
sm = boto3.client('secretsmanager')
dynamodb = boto3.resource('dynamodb')

# ENV
SECRET_ARN = os.environ.get('TICKET_API_SECRET_ARN')  # preferred
FALLBACK_URL = os.environ.get('TICKET_API_URL')
FALLBACK_AUTH_TYPE = os.environ.get('TICKET_API_AUTH_TYPE', 'bearer')
FALLBACK_API_KEY = os.environ.get('TICKET_API_KEY')
DDB_TABLE = os.environ.get('TICKET_DDB_TABLE')  # optional
PRESIGN_EXPIRY = int(os.environ.get('PRESIGN_EXPIRY', '3600'))  # seconds

SUPPORTED_TRANSCRIPT_KEY = ['results','transcripts']

def get_api_config():
    """Fetch API URL and credentials from Secrets Manager or env vars."""
    if SECRET_ARN:
        try:
            resp = sm.get_secret_value(SecretId=SECRET_ARN)
            secret = json.loads(resp.get('SecretString') or "{}")
            url = secret.get('url')
            auth_type = secret.get('auth_type', 'bearer')
            api_key = secret.get('api_key') or secret.get('token')
            user = secret.get('username')
            password = secret.get('password')
            return {'url': url, 'auth_type': auth_type, 'api_key': api_key, 'user': user, 'password': password}
        except ClientError as e:
            logger.error("Failed to fetch secret: %s", e)
            # fall back to env vars
    # fallback
    return {'url': FALLBACK_URL, 'auth_type': FALLBACK_AUTH_TYPE, 'api_key': FALLBACK_API_KEY, 'user': None, 'password': None}


def create_presigned_url(bucket, key, expiry=PRESIGN_EXPIRY):
    """Return a presigned GET URL for the audio object."""
    return s3.generate_presigned_url(
        ClientMethod='get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expiry
    )

def store_ticket_log(ticket_payload, api_response):
    """Optionally store the original payload + API response into DynamoDB for audit."""
    if not DDB_TABLE:
        return
    table = dynamodb.Table(DDB_TABLE)
    item = {
        'ticketId': ticket_payload.get('client_ticket_id') or ticket_payload.get('title')[:40] + '-' + str(int(time.time())),
        'createdAt': int(time.time()),
        'payload': ticket_payload,
        'apiResponse': api_response
    }
    try:
        table.put_item(Item=item)
    except Exception as e:
        logger.error("Failed to write to DynamoDB: %s", e)

def post_ticket_to_api(api_conf, payload):
    """Post ticket to external API with retries and return (status_code, text)."""
    url = api_conf['url']
    headers = {'Content-Type': 'application/json'}
    auth_type = api_conf.get('auth_type', 'bearer')
    if auth_type in ('bearer', 'apikey'):
        token = api_conf.get('api_key')
        headers['Authorization'] = f"Bearer {token}"
    elif auth_type == 'basic':
        # requests supports (user, pass) tuple
        pass

    max_retries = 3
    backoff = 1
    for attempt in range(1, max_retries+1):
        try:
            if auth_type == 'basic' and api_conf.get('user') and api_conf.get('password'):
                resp = requests.post(url, json=payload, headers=headers, auth=(api_conf['user'], api_conf['password']), timeout=10)
            else:
                resp = requests.post(url, json=payload, headers=headers, timeout=10)
            logger.info("API call status: %s", resp.status_code)
            return resp.status_code, resp.text
        except Exception as ex:
            logger.warning("API request attempt %s failed: %s", attempt, ex)
            if attempt == max_retries:
                raise
            time.sleep(backoff)
            backoff *= 2

def lambda_handler(event, context):
    logger.info("Event received: %s", json.dumps(event))
    try:
        rec = event['Records'][0]
        bucket = rec['s3']['bucket']['name']
        key = urllib.parse.unquote_plus(rec['s3']['object']['key'])

        logger.info("Transcript JSON arrived: s3://%s/%s", bucket, key)

        # 1) read the transcript JSON
        resp = s3.get_object(Bucket=bucket, Key=key)
        transcript_json = json.loads(resp['Body'].read())

        # 2) defensive extraction
        if 'results' not in transcript_json or 'transcripts' not in transcript_json['results']:
            raise ValueError("Transcript JSON missing expected keys")

        transcript_text = transcript_json['results']['transcripts'][0].get('transcript', '').strip()
        if not transcript_text:
            raise ValueError("Transcript text empty")

        # 3) prepare ticket payload
        # title: first 70 chars or first sentence
        title = transcript_text.split('.', 1)[0].strip()
        if len(title) > 70:
            title = title[:70] + "..."
        # generate presigned link to original audio:
        # we assume original key is stored in transcript JSON or stored earlier in DynamoDB
        # if you stored original audio S3 URI in DynamoDB or in transcription results, use it
        # Below we attempt to find audio S3 URI in JSON 'media' fields; adapt as needed.
        presigned_audio = None
        # Example: if you earlier saved audio S3 path in transcript_json['audio_segments'] or in object metadata.
        # If not available, you can omit or store transcript only.
        # For safety, try to detect original object from transcript jobName -> your DB mapping
        # For now, we skip presigned if not available.

        ticket_payload = {
            "title": title or "Voice support request",
            "description": transcript_text,
            "priority": "Medium",
            # Add fields your ticket API expects, e.g. "department": "IT"
        }
        if presigned_audio:
            ticket_payload['audio_url'] = presigned_audio

        # 4) get API config (secrets or env)
        api_conf = get_api_config()
        if not api_conf.get('url'):
            raise ValueError("Ticket API URL not configured")

        # 5) call ticket API
        status_code, resp_text = post_ticket_to_api(api_conf, ticket_payload)

        # 6) log result to DynamoDB (optional)
        api_response = {'status_code': status_code, 'body': resp_text}
        store_ticket_log(ticket_payload, api_response)

        logger.info("Ticket creation result: %s", api_response)
        return {
            "statusCode": 200,
            "body": json.dumps({"apiResponse": api_response})
        }

    except Exception as e:
        logger.exception("Fatal error processing transcript")
        return {
            "statusCode": 500,
            "body": str(e)
        }
