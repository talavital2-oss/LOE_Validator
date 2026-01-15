# LOE Validator

A web application that validates Statement of Work (SOW) documents against Level of Effort (LOE) estimates. Upload your documents, configure the mapping, and get comprehensive analysis with AI-powered insights.

## Features

- **Document Upload**: Upload SOW (Word/PDF) and LOE (Excel) documents
- **Smart Parsing**: Automatically extracts tasks from SOW tables and LOE spreadsheets
- **Column Mapping**: Flexible configuration for different LOE Excel formats
- **Task Matching**: Fuzzy matching algorithm to pair SOW tasks with LOE entries
- **Complexity Analysis**: Keyword-based complexity detection for duration validation
- **Duration Validation**: Compares expected vs actual effort estimates
- **AI Chat**: Ask questions about the validation results using Claude AI
- **Report Generation**: Download Word document reports

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │ File Upload  │  │ Column Mapping │  │ Results Dashboard  │  │
│  └──────────────┘  └────────────────┘  └────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    AI Chat Panel                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │   Document   │  │   Validator    │  │      Chat          │  │
│  │    Parser    │  │    Service     │  │     Service        │  │
│  └──────────────┘  └────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                   ┌───────────────────────┐
                   │   Anthropic Claude    │
                   │        API            │
                   └───────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Anthropic API Key (for AI chat feature)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set API key (optional, for chat feature)
export ANTHROPIC_API_KEY=your-api-key

# Run the server
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at `http://localhost:3000`

### Using Docker

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=your-api-key

# Build and run with Docker Compose
docker-compose up --build
```

## Usage

1. **Upload Documents**
   - Drag & drop your SOW document (Word or PDF)
   - Drag & drop your LOE Excel file
   - Enter customer and project names

2. **Configure Column Mapping**
   - Select which Excel columns contain task names, days, etc.
   - The system auto-detects common column names

3. **Validate**
   - Click "Compare & Validate" to analyze the documents
   - View task matching, complexity analysis, and duration validation

4. **Review Results**
   - Check the validation status (PASS/WARNING/FAIL)
   - Review matched tasks and any issues
   - Use the AI chat to ask questions about the results

5. **Export**
   - Download a Word document report

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload a document |
| `/api/preview-excel/{file_id}` | GET | Preview Excel columns |
| `/api/validate` | POST | Validate SOW vs LOE |
| `/api/generate-report/{id}` | POST | Generate Word report |
| `/api/chat` | POST | Chat about results |
| `/api/chat/stream` | POST | Stream chat response |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Required for chat |
| `UPLOAD_DIR` | Directory for uploaded files | `./uploads` |
| `REPORTS_DIR` | Directory for generated reports | `./reports` |

### Complexity Keywords

The validator uses keyword-based complexity analysis. Default categories include:

- **Architecture**: HA, Stretched Cluster, Multi-Site, DR
- **Integration**: API, Third-Party, SSO, LDAP
- **Scale**: Enterprise, Large Scale, 1000+ users
- **Security**: Zero Trust, HIPAA, PCI-DSS
- **Migration**: Migration, Cutover, Data Transfer

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, Radix UI
- **Backend**: FastAPI, Python 3.11
- **Document Parsing**: python-docx, pdfplumber, openpyxl
- **AI**: Anthropic Claude API
- **Matching**: RapidFuzz for fuzzy string matching

## License

MIT License - see LICENSE file for details

## Credits

Built with the SOW-LOE Validator MCP as the core validation engine.
