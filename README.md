# PolicyMarket

A modern web interface for exploring and tracking policy prediction markets. Browse federal, state, and local policy markets, filter by topic, and view live odds in a clean, civic-style layout.

## Features

- **Region & jurisdiction** — Toggle between Federal, State, and Local views
- **Search** — Find policies and topics quickly
- **Category filters** — Climate, Health, Economy, Tech
- **Policy cards** — Pass probability (odds), tags, and watch list
- **Market trend chart** — Simple bar visualization; click a policy to focus
- **Live status** — UI indicates live data

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000`.

## Repository

**GitHub:** [carsonmoore13/PolicyMarket](https://github.com/carsonmoore13/PolicyMarket)

### Work from WSL on `main`

This repo is **standalone** (not inside another project). Clone it where you want to work:

```bash
cd ~
# or: mkdir -p ~/Hackathon && cd ~/Hackathon
git clone https://github.com/carsonmoore13/PolicyMarket.git
cd PolicyMarket
git branch   # should show main
```

**Daily workflow:**

```bash
cd ~/PolicyMarket   # or wherever you cloned it
git pull origin main
# ... edit files ...
git add .
git commit -m "Your message"
git push origin main
```
