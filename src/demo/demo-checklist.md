# Demo Presentation Checklist

## Pre-Demo (5 minutes)
- [ ] Run `chmod +x src/demo/setup-demo.sh && ./src/demo/setup-demo.sh`
- [ ] Import Postman collection: `postman/Demographics-API-Demo.postman_collection.json`
- [ ] Import environment: `postman/Demographics-API-Environment.postman_environment.json`
- [ ] Open terminal: `node src/demo/monitor-dashboard.js`
- [ ] Open second terminal: `./src/demo/watch-logs.sh`

## Demo Flow (15 minutes)
1. **Health Check** - Show system status in Postman
2. **Create API Key** - Generate key, watch auto-population
3. **Document Upload** - Generate SAS URL, show Azurite
4. **Single Demographics** - Submit, watch queue processing
5. **Batch Processing** - Submit batch, show parallel processing
6. **Data Retrieval** - Get, search, filter data
7. **Update Record** - Show idempotency, version control
8. **Monitoring** - Show queue status, metrics

## Visual Elements
- [ ] Postman requests with tests passing
- [ ] Real-time dashboard showing metrics
- [ ] Docker logs flowing with processing
- [ ] Database records appearing in real-time

## Key Talking Points
- Microservices architecture
- FIFO queues for ordered processing
- Secure document upload with SAS URLs
- Rate limiting and API security
- Comprehensive monitoring and observability