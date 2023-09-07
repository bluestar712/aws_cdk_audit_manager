#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuditManagerStack } from '../lib/auditmanager-stack';

const app = new cdk.App();

const stack = new AuditManagerStack(app, 'CdkAuditManagerStack', {});

app.synth();