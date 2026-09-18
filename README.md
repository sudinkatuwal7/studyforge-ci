# StudyForge

![StudyForge Logo](images/StudyForge.png)

**Turn your class materials into smarter study resources.**


StudyForge is an AI-powered study platform designed to help college students transform their class materials into personalized study resources and practice tools.

## Table of Contents

* [Description](#description)
* [General Information](#general-information)
* [Technologies Used](#technologies-used)
* [Features](#features)

---

## Description

### Who are we working with?

StudyForge is being developed by a team of five students:

* Gaurav Paneru
* Nischal Rimal
* Sanish Shrestha
* Sudin Katuwal
* Aashish Dhital

As a team, we will collaborate throughout the semester to design, develop, test, and improve StudyForge using an iterative software development process.

### What are we creating?

We are creating an AI-powered study application that allows students to upload their class materials and transform them into useful study resources.

StudyForge is intended to help students generate resources such as summaries, study guides, flashcards, and practice questions based on the materials they provide.

### Who are we creating it for?

StudyForge is primarily designed for college students who want a more efficient and organized way to study and prepare for classes, quizzes, and exams.

It can be especially useful for students who have large amounts of lecture slides, notes, PDFs, and other course materials that they need to review.

### Why are we creating it?

Students often spend a significant amount of time organizing course materials and manually creating study guides, flashcards, summaries, and practice questions before they can begin actively studying.

StudyForge aims to reduce that preparation time by helping students transform their existing course materials into structured study resources.

Our goal is not to replace studying, but to help students spend less time preparing study materials and more time reviewing, practicing, and understanding course content.

### Project Vision

We are working as a team to build an AI-powered study platform for college students so that they can transform their existing class materials into organized, personalized study resources and spend more time actively learning.

---

## General Information

StudyForge is based on the following user story:

**As a student, I want to turn my class materials into personalized study resources and practice tests so that I can study more efficiently and better understand the material.**


The main problem StudyForge intends to address is the amount of time and effort students spend turning raw course materials into resources that are easier to study from.

Instead of manually creating every summary, study guide, flashcard set, or practice quiz, students will be able to use StudyForge to generate study resources from materials they already have.

### Project Image

![StudyForge Project Icon](images/StudyForge.png)

The StudyForge project image represents the combination of education and technology. It reflects the idea of taking existing course materials and transforming them into useful tools for learning, reviewing, and practicing course content.

### What We Would Like to Have

As the project develops, we would like to receive feedback from students who use StudyForge in real study situations.

Their feedback could help us determine which features are most useful, identify usability problems, and guide future improvements.

---

## Technologies

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite), PDF.js | SPA with an in-browser PDF viewer for one-click citation checking |
| Backend | Python 3.12, Django, Django REST Framework | REST API, authentication, ORM and migrations in one framework |
| Background jobs | Celery + Redis | Document parsing and embedding run outside the request cycle |
| Document parsing | pypdf, python-pptx | Text extraction with page and slide numbers preserved |
| Database | PostgreSQL + pgvector | Relational data and vector similarity search in one database |
| AI | LLM API and embedding model (provider chosen after our accuracy spike) | Answer generation and retrieval |
| Testing | pytest-django, Vitest, React Testing Library, Mock Service Worker | Backend, frontend and mocked-API tests |
| Containers | Docker, Docker Compose | Reproducible local environment |
| Deployment | Kubernetes (kind for local clusters) | Course requirement; runs web, api, worker and database |
| Source control | Bitbucket + Bitbucket Pipelines | Course requirement; CI on pull requests |
| Project tracking | Jira (Study Forge, key SCRUM) | Course requirement; sprints and user stories |

### Starter code

No starter code is taken from GitHub or any similar site. Projects are generated with the
official tools: `django-admin startproject` for the backend and `npm create vite` for the
frontend. We reviewed two open-source projects for reference only, without copying code:
open-notebook (MIT) and kotaemon (Apache-2.0).

---

## Features

The following features are planned as the initial focus for the first sprint.

### 1. User Account and Login

*What it does:*  
Allows students to create an account and log in to StudyForge so that their courses, uploaded materials, and generated resources can be associated with their profile.

*Who uses it:*  
Students use this feature to securely access their personal StudyForge workspace.

### 2. Course Management

*What it does:*  
Allows students to create courses or subjects and organize their study materials under the appropriate class.

*Who uses it:*  
Students use this feature to keep materials from different courses separated and easier to manage.

### 3. Class Material Upload

*What it does:*  
Allows students to upload course materials such as lecture notes, PDFs, or other supported documents.

*Who uses it:*  
Students use this feature to provide StudyForge with the source material that will be used to create study resources.

### 4. Study Material Organization

*What it does:*  
Allows students to view and organize uploaded materials by course or subject.

*Who uses it:*  
Students use this feature to quickly find and manage previously uploaded course materials.

### 5. Initial Study Resource Generation

*What it does:*  
Allows students to generate an initial study resource from uploaded course material. The first version will focus on establishing the basic workflow between uploaded content and AI-generated study output.

*Who uses it:*  
Students use this feature to turn their uploaded course material into a resource they can review while studying.

---

As development continues, StudyForge will be expanded through additional sprints based on team priorities, testing results, technical feasibility, and student feedback.