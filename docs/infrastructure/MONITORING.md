# Monitoring Setup with Pulumi

The Observation Explorer infrastructure automatically deploys a ServiceMonitor for Prometheus Operator integration.

## Components

### ServiceMonitor

- **Name**: `observation-explorer-servicemonitor`
- **Namespace**: `observation-explorer`
- **Scrape Target**: `/api/metrics` endpoint on port 3000
- **Interval**: 30 seconds
- **Timeout**: 10 seconds

### Metrics Collected

The ServiceMonitor filters to collect only our custom business metrics:

- `cache_hits_total` - Cache performance tracking
- `cache_misses_total` - Cache miss monitoring
- `external_api_requests_total` - External API call tracking
- `observations_displayed_total` - User engagement metrics
- `user_refresh_actions_total` - User interaction tracking
- `new_data_detections_total` - Real-time data detection
- `application_errors_total` - Error rate monitoring

### Service Configuration

The web service exposes two ports:

- **Port 3000**: Main HTTP traffic + `/api/metrics`
- **Port 9464**: Reserved for OpenTelemetry metrics (future use)

### Health Checks

The deployment includes:

- **Liveness probe**: `/api/health` endpoint (30s delay, 10s interval)
- **Readiness probe**: `/api/health` endpoint (5s delay, 5s interval)

## Labels and Selectors

### Service Labels

```yaml
app: observation-explorer
```

### ServiceMonitor Labels

```yaml
app: observation-explorer
release: prometheus # Standard Prometheus Operator label
```

## Deployment

The ServiceMonitor is automatically created when deploying with:

```bash
pulumi up
```

## Verification

After deployment, verify the ServiceMonitor is working:

1. **Check ServiceMonitor exists**:

   ```bash
   kubectl get servicemonitor observation-explorer-servicemonitor -n observation-explorer
   ```

2. **Verify Prometheus targets**:

   - Access Prometheus UI
   - Go to Status → Targets
   - Look for `observation-explorer` endpoints

3. **Test metrics endpoint**:
   ```bash
   kubectl port-forward svc/observation-explorer-web-service 3000:3000 -n observation-explorer
   curl http://localhost:3000/api/metrics
   ```

## Troubleshooting

**ServiceMonitor not discovered**:

- Verify Prometheus Operator is running
- Check label selectors match
- Confirm `release: prometheus` label is correct for your setup

**No metrics scraped**:

- Check pod is running and healthy
- Verify `/api/metrics` endpoint is accessible
- Confirm service ports are correctly configured

**Missing metrics in queries**:

- Check metric names match the regex filter
- Verify metrics are being generated by the application
- Confirm scrape interval allows time for metric generation
