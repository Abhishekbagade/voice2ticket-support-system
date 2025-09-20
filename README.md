# Voice2Ticket: Voice-Based IT Support Ticketing System

**Author:** Abhishek Bagade  
**Date:** 20th August 2025  

Live Demo: https://voice2ticket-web.s3.us-east-1.amazonaws.com/index.html 

---

## Project Overview
Voice2Ticket is a serverless application that allows users to create IT support tickets using natural speech. By leveraging AWS services such as **Lambda, Transcribe, Comprehend, API Gateway, S3, and DynamoDB**, the system converts spoken language into structured text, extracts key information like urgency and problem type, and automatically creates a ticket in **Jira Service Desk**.

The project demonstrates real-world application of cloud-native serverless architecture to streamline IT support workflows.

---

## Architecture

### Core Components
- **Frontend (React JS / S3 Hosting):** Web interface for recording and submitting voice tickets  
- **API Gateway:** HTTPS endpoint for frontend requests  
- **Lambda (Orchestrator):** Coordinates audio transcription and text analysis  
- **Amazon Transcribe:** Converts audio recordings into text  
- **Amazon Comprehend:** Detects sentiment and key phrases to assign ticket priority  
- **Lambda (Ticket Creator):** Sends ticket details to Jira API  
- **S3:** Stores original audio files for record-keeping  
- **DynamoDB:** Logs transcription results and ticket metadata  

### System Diagram
![Architecture Diagram](docs/architecture-diagram.png)

---

## Features
- Voice-based ticket creation using microphone input  
- Automatic transcription of audio into text  
- Sentiment analysis to prioritize urgent tickets  
- User & Admin dashboards for ticket management  
- Role-based access: users see their tickets, admins see all  
- Integration with Jira Service Desk  

---

## AWS Services Used
- **Compute:** AWS Lambda (Serverless functions)  
- **API Management:** Amazon API Gateway  
- **AI/ML:** Amazon Transcribe, Amazon Comprehend  
- **Storage:** S3 (audio files), DynamoDB (metadata/logs)  
- **Hosting:** AWS Amplify / S3 + CloudFront  
- **Security:** IAM roles and permissions  

---

## Implementation Details

### Frontend
- HTML, CSS, and JavaScript (React JS) for UI  
- MediaRecorder API captures user audio  
- Audio uploaded to S3 bucket  

### Backend (Serverless)
- **Orchestrator Lambda:** Initiates transcription, calls Comprehend for sentiment/key phrases  
- **Ticket Creator Lambda:** Formats JSON and creates Jira tickets via API  
- **Event-Driven Workflow:** SNS triggers handle asynchronous processing  

---

## Challenges & Solutions
1. **Lambda Timeout:** Converted to async event-driven workflow using SNS  
2. **Poor Transcriptions:** Implemented custom vocabulary in Amazon Transcribe  
3. **IAM Access Issues:** Applied least-privilege IAM policies  
4. **Cost Management:** Reduced unnecessary Comprehend invocations  

---

## Future Enhancements
- Feedback loop for low-confidence transcriptions  
- Auto-close tickets after resolution  
- Real-time transcription streaming with Amazon Transcribe  
