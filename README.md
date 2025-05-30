# Fog of Dog 🗺️

A mobile game that implements a fog-of-war mechanic for real-world GPS movement. Players explore and reveal areas on the map by physically moving in the real world.

## Features

- **GPS-Based Exploration**: Reveal portions of a fog-covered map as you move
- **Basic Metrics Tracking**: Monitor your time played, distance traveled, and GPS history
- **Map Skins**: Customize your map appearance with different visual styles
- **Social Features**: Share your explored areas with friends (coming soon)
- **Live Events**: Participate in time-limited exploration events (coming soon)

## Getting Started

### Prerequisites

- Node.js 18+
- Go 1.21+
- Expo CLI
- Docker (optional, for local development)

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm start
```

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Go dependencies
go mod download

# Start the development server
go run cmd/server/main.go
```

## Development

### Frontend Development

The frontend is built with React Native using Expo. To start development:

1. Install the Expo Go app on your mobile device
2. Run `npm start` in the frontend directory
3. Scan the QR code with your device

### Backend Development

The backend is written in Go and follows a standard Go project layout:

1. Navigate to the backend directory
2. Make changes in the relevant package under `pkg/` or `internal/`
3. Run tests with `go test ./...`

## Project Structure

See [STRUCTURE.md](./STRUCTURE.md) for a detailed breakdown of the project organization.

## Testing

### Frontend Tests

```bash
cd frontend
npm test
```

### Backend Tests

```bash
cd backend
go test ./...
```

## Deployment

### Frontend Deployment

1. Update version in `frontend/app.json`
2. Build for production:
   ```bash
   cd frontend
   eas build --platform all
   ```
3. Submit to app stores following their respective guidelines

### Backend Deployment

The backend is deployed on AWS using Lambda and API Gateway. See deployment documentation for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is proprietary and confidential. All rights reserved.

## Acknowledgments

- OpenStreetMap for map data
- AWS for infrastructure
- React Native and Expo teams 