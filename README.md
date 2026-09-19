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

###Features

The following features are planned based on the current StudyForge Jira user stories and development tasks.


1. User Authentication

What it does:
Allows students to create an account, securely log in, and log out of StudyForge. Authentication protects courses, uploaded materials, and generated study resources so that students can access only their own data.

Who uses it:
Students use this feature to securely access their personal StudyForge workspace and protected application features.



2. Course Management

What it does:
Allows students to create one or more courses with a name and optional description. Students can view their course list, rename courses, delete courses with confirmation, and view the materials associated with each course.

Who uses it:
Students use this feature to organize their study materials and generated resources by class or subject.



3. PDF Upload and Processing Status

What it does:
Allows students to upload PDF course materials to a course and view the processing status of each document.

Uploaded documents can display statuses such as Processing, Ready, or Failed so students know when a document is available for study features. Invalid files, unsupported PDFs, and files that exceed the upload limit are rejected with a clear error message.

Who uses it:
Students use this feature to add course materials to StudyForge and track when those materials are ready to use.



4. Course Material Management

What it does:
Allows students to view and manage materials uploaded to a course. The material list can display information such as the file name, file type, and upload date.

Students can rename uploaded materials or delete them after confirming the deletion. Deleted materials are no longer available for future study-resource generation.

Who uses it:
Students use this feature to keep their uploaded course materials organized and up to date.



5. Source Selection

What it does:
Allows students to choose which uploaded materials should be used when asking questions or generating study resources.

Students can select one, multiple, or all materials from a course. StudyForge uses only the selected materials when retrieving information or generating resources, and the selection can remain available during the current session for follow-up requests.

Who uses it:
Students use this feature when they want StudyForge to focus on specific lectures, notes, or documents instead of every file in a course.



6. Page-Cited Question Answering

What it does:
Allows students to ask questions about their uploaded course materials and receive answers supported by citations.

Answers can include the source document and page number where the information was found. Students can select a citation to open the corresponding PDF at the cited page and verify the information directly.

If the uploaded materials do not contain enough information to answer a question, StudyForge indicates that the answer could not be found instead of relying on unrelated general information.

Who uses it:
Students use this feature to review course content, ask questions, and verify AI-generated answers against their original class materials.



7. Study Guide Generation

What it does:
Allows students to generate a structured study guide from one or more selected course materials.

Generated study guides can include organized summaries, important terms, and key concepts based only on information retrieved from the selected materials.

Who uses it:
Students use this feature to quickly create organized review material before quizzes, exams, or study sessions.



8. Flashcard Quiz Generation

What it does:
Allows students to generate practice quizzes from materials associated with a selected course.

Students can answer generated questions and submit their responses while StudyForge tracks their progress through the quiz.

Who uses it:
Students use this feature to practice recalling and applying information from their course materials.



9. Quiz Feedback, Explanations, and Scoring

What it does:
Provides feedback after students submit quiz answers.

StudyForge indicates whether an answer is correct or incorrect, displays an explanation after each response, tracks quiz progress, and provides a final score or completion summary when the quiz is finished.

Who uses it:
Students use this feature to identify areas they understand and topics that may require additional review.

As development continues, StudyForge will be expanded through additional sprints based on team priorities, testing results, technical feasibility, and student feedback.
10. Study Progress Tracking

What it does:
Allows students to track their study progress for each course.

StudyForge allows students to create study goals, mark goals as completed, view completed and incomplete goals, and see their overall progress for each course.

Who uses it:
Students use this feature to keep track of their study goals and identify what they have completed and what they still need to work on.


11. Study Session Scheduling

What it does:
Allows students to schedule and manage study sessions for their courses.

StudyForge allows students to create study sessions for a selected course, specify the date, start time, and duration, view upcoming study sessions, and edit or delete scheduled sessions.

Who uses it:
Students use this feature to organize their study time and prepare for upcoming assignments and exams.