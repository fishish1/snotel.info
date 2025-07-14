# snotel.info

This repository contains the source code for [snotel.info](https://snotel.info), a web-based dashboard for viewing and interacting with data from the SNOTEL (Snow Telemetry) network, operated by the USDA's Natural Resources Conservation Service (NRCS).

## Architecture

The project is built on a serverless architecture using Amazon Web Services (AWS).

-   **Frontend**: A static single-page application (SPA) hosted on Amazon S3 and distributed via Amazon CloudFront for low-latency access.
-   **Backend**: A serverless API built with Amazon API Gateway and AWS Lambda.
-   **Infrastructure as Code**: The backend infrastructure (API Gateway, Lambda functions, IAM roles, etc.) is defined and managed using AWS CloudFormation with the AWS Serverless Application Model (SAM).
-   **CI/CD**: Deployment is automated using GitHub Actions workflows.

### Backend Components

The backend consists of several Lambda functions:

-   `generateState`: A scheduled function that runs daily for each supported state. It fetches the latest daily snow data from the NRCS SOAP API, processes it into a GeoJSON format, and caches it in an S3 bucket. This pre-processing makes loading state-level data very fast.
-   `getState`: An API Gateway endpoint (`/state/{state}`) that serves the pre-generated GeoJSON data for a given state from the S3 cache.
-   `getHourly`: An API Gateway endpoint (`/hourly/{stationTriplet}`) that fetches near-real-time hourly data for a specific SNOTEL station directly from the NRCS SOAP API.

## Deployment

The repository is configured with GitHub Actions for continuous deployment.

1.  **Frontend Deployment**: On a push to the `main` branch, a workflow builds the frontend application and syncs the static files to the S3 bucket configured for website hosting.
2.  **Backend Deployment**: On a push to the `main` branch, a separate workflow packages and deploys the backend using the CloudFormation template. It creates or updates the API Gateway, Lambda functions, and all related resources.

### Manual Setup Prerequisites

This repository contains almost everything needed to run the application. However, a few items must be configured manually in your AWS account before the deployment workflows can succeed:

1.  **Route 53**: DNS records for your custom domain (e.g., `snotel.info` and `api.snotel.info`) must be configured in Route 53 to point to the CloudFront distribution and API Gateway custom domain, respectively.
2.  **GitHub Actions Secrets**: The GitHub workflows require AWS credentials to deploy resources. You must configure repository secrets (e.g., `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) with an IAM user that has sufficient permissions to manage CloudFormation, S3, Lambda, and API Gateway.
3.  **ACM Certificate**: An AWS Certificate Manager (ACM) certificate for your custom domain must be created in the `us-east-1` region for use with API Gateway. The ARN of this certificate is a required parameter for the CloudFormation stack.
4.  **Google Maps API Key**: The frontend uses the Google Maps API. You will need to obtain your own API key from the Google Cloud Console. The key in this repository is restricted to the `snotel.info` domain and will need to be replaced in the frontend source code before deployment.
