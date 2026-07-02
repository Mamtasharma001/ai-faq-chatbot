/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FAQ } from '../types';

export const INITIAL_FAQS: FAQ[] = [
  {
    id: '1',
    category: 'Billing',
    question: 'What is your refund policy for annual subscriptions?',
    answer: 'You can request a full refund within 30 days of purchase. For annual plans, we provide a prorated refund if requested after the initial 30 days but before 90 days. No refunds are available after 90 days.'
  },
  {
    id: '2',
    category: 'Account',
    question: 'How do I reset my password if I am locked out?',
    answer: 'Click the "Forgot Password" link on the login page. Enter your registered email address, and we will send you a secure password reset link containing instructions. Be sure to check your spam folder.'
  },
  {
    id: '3',
    category: 'Security',
    question: 'How do I enable Multi-Factor Authentication (MFA) for security?',
    answer: 'Go to your Account Settings, select the "Security" tab, and click "Enable Multi-Factor Authentication". You can use an authenticator app (like Google Authenticator or Authy) to scan the QR code and complete verification.'
  },
  {
    id: '4',
    category: 'Technical',
    question: 'What are the system requirements for the desktop client?',
    answer: 'Our desktop client requires Windows 10 or later, macOS 11 Big Sur or later, or Ubuntu 20.04 LTS. A minimum of 4GB RAM (8GB recommended) and 500MB free disk space are required.'
  },
  {
    id: '5',
    category: 'Billing',
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards (Visa, MasterCard, American Express, Discover), PayPal, Apple Pay, and Google Pay. For enterprise accounts, we also support bank wire transfers and invoice billing.'
  },
  {
    id: '6',
    category: 'General',
    question: 'How do I contact customer support?',
    answer: 'You can contact customer support by clicking the "Submit a Ticket" link in the header, emailing support@ai-faq-chatbot.com, or using our Live Chat tool available Mon-Fri 9 AM to 5 PM EST.'
  },
  {
    id: '7',
    category: 'Technical',
    question: 'Do you have an API available for developers?',
    answer: 'Yes! We offer a full-featured REST API with JSON responses. You can find our comprehensive API documentation and obtain your developer API keys in the developer portal under Account Settings > API Keys.'
  },
  {
    id: '8',
    category: 'Account',
    question: 'Can I delete my account permanently?',
    answer: 'Yes. To delete your account permanently, go to Account Settings > Privacy, and click "Delete Account". This action is irreversible and will permanently purge all your data, chats, and subscriptions from our servers.'
  },
  {
    id: '9',
    category: 'General',
    question: 'How do I upgrade or downgrade my current pricing plan?',
    answer: 'Navigate to the "Billing" section inside your dashboard, click "Change Plan", and select the plan you wish to switch to. Upgrades take effect immediately (with prorated pricing), while downgrades apply at the end of the current billing cycle.'
  },
  {
    id: '10',
    category: 'Security',
    question: 'Is my personal data encrypted and secure on your platform?',
    answer: 'Absolutely. We encrypt all sensitive user data at rest using AES-256 encryption and in transit using TLS 1.3 protocols. We do not store plain-text passwords and are fully SOC2 and GDPR compliant.'
  }
];
