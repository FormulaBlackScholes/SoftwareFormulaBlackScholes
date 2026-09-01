<?php
/**
 * Plugin Name: Trading Signals API
 * Description: Secure CPU-optimized API for reading trading signals, logging actions, updating/resetting segnale, updating tipo_account, updating stato_software, and erasing selected fields.
 * Version: 2.1.0-cpu-optimized
 * Author: Nobel Trading
 */

// Prevent direct access
if (!defined('ABSPATH')) exit;

class TradingSignalsAPI {

    const OPTION_API_KEY         = 'trading_api_key';
    const OPTION_CLIENT_KEYS     = 'trading_client_api_keys';
    const OPTION_TABLE_BASENAME  = 'trading_signals_table_base';   // e.g., "user_signals"
    const OPTION_ALLOWED_IPS     = 'trading_allowed_ips';
    const OPTION_RATE_LIMIT_PM   = 'trading_rate_limit_per_minute';
    const OPTION_LOG_RETENTION_DAYS = 'trading_log_retention_days';
    const OPTION_LOG_READ_ENDPOINTS = 'trading_log_read_endpoints';
    const LOGS_TABLE_SUFFIX      = 'trading_api_logs';             // "{$wpdb->prefix}trading_api_logs"

    // CPU protection defaults. Keep read/polling endpoints very light.
    const DEFAULT_LOG_RETENTION_DAYS = 14;
    const DEFAULT_LOG_READ_ENDPOINTS = 0;

    public function __construct() {
        add_action('rest_api_init',            [$this, 'register_routes']);
        add_action('admin_menu',               [$this, 'admin_menu']);
        add_action('admin_notices',            [$this, 'api_key_notice']);
        // Prevent any caching layer from serving stale trading data
        add_filter('rest_post_dispatch', [$this, 'add_no_cache_headers'], 10, 3);
    }

    public function add_no_cache_headers($response, $server, $request) {
        if (strpos($request->get_route(), '/trading/v1/') !== false) {
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            $response->header('Pragma', 'no-cache');
            $response->header('Expires', '0');
        }
        return $response;
    }

    /* -----------------------------
     * REST API
     * ----------------------------- */
    public function register_routes() {
        // Read (optionally filter by email, limit)
        register_rest_route('trading/v1', '/signals/pending', [
            'methods'  => 'GET',
            'callback' => [$this, 'get_pending_signals'],
            'permission_callback' => [$this, 'check_api_key'],
        ]);

        // Log-only "complete"
        register_rest_route('trading/v1', '/signals/(?P<id>\d+)/complete', [
            'methods'  => 'POST',
            'callback' => [$this, 'mark_signal_processed_log_only'],
            'permission_callback' => [$this, 'check_api_key'],
        ]);

        // Update or reset segnale, update tipo_account
        register_rest_route('trading/v1', '/signals/(?P<id>\d+)/status', [
            'methods'  => 'POST',
            'callback' => [$this, 'update_signal_status'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'segnale' => [
                    'required' => false,
                    'type'     => 'string',
                ],
                'reset' => [
                    'required' => false,
                    'type'     => 'boolean',
                ],
                'tipo_account' => [
                    'required' => false,
                    'type'     => 'string',
                ],
                'stato_software' => [
                    'required' => false,
                    'type'     => 'string',
                ],
            ],
        ]);

        // Erase selected fields (set to NULL)
        register_rest_route('trading/v1', '/signals/(?P<id>\d+)/erase', [
            'methods'  => 'POST',
            'callback' => [$this, 'erase_signal_fields'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'fields' => [
                    'required' => false,
                    'type'     => 'string',
                ],
                'strike' => [ 'required' => false ],
                'margine_per_contratto' => [ 'required' => false ],
                'orario_scadenza' => [ 'required' => false ],
                'giorni_a_scadenza' => [ 'required' => false ],
                'all' => [ 'required' => false, 'type' => 'boolean' ],
            ],
        ]);

        // Get margin per contract for a user
        register_rest_route('trading/v1', '/margin', [
            'methods' => 'GET',
            'callback' => [$this, 'get_margin_per_contract'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type' => 'string',
                    'validate_callback' => function($param) {
                        return is_email($param);
                    }
                ],
            ],
        ]);

        // Read ALL signals (for admin panel) - no limit
        register_rest_route('trading/v1', '/signals/all', [
            'methods'  => 'GET',
            'callback' => [$this, 'get_all_signals'],
            'permission_callback' => [$this, 'check_api_key'],
        ]);

        // Sync real wallet to client level
        register_rest_route('trading/v1', '/sync-real-level', [
            'methods' => 'POST',
            'callback' => [$this, 'sync_real_level'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type' => 'string',
                    'validate_callback' => function($param) {
                        return is_email($param);
                    }
                ],
            ],
        ]);

        // Send order to user
        register_rest_route('trading/v1', '/signals/(?P<id>\d+)/order', [
            'methods' => 'POST',
            'callback' => [$this, 'send_order'],
            'permission_callback' => [$this, 'check_api_key'],
        ]);

        // Get API logs from trading_api_logs
        register_rest_route('trading/v1', '/logs', [
            'methods' => 'GET',
            'callback' => [$this, 'get_logs'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'limit' => [
                    'required' => false,
                    'type' => 'integer',
                    'default' => 100,
                ],
            ],
        ]);

        // Send email to user
        register_rest_route('trading/v1', '/email/send', [
            'methods' => 'POST',
            'callback' => [$this, 'send_email'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'to' => [
                    'required' => true,
                    'type' => 'string',
                    'validate_callback' => function($param) {
                        return is_email($param);
                    }
                ],
                'subject' => [
                    'required' => true,
                    'type' => 'string',
                ],
                'body' => [
                    'required' => true,
                    'type' => 'string',
                ],
            ],
        ]);

        // Create or update a user in user_signals
        register_rest_route('trading/v1', '/signals/user', [
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_or_update_user'],
                'permission_callback' => [$this, 'check_api_key'],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_user'],
                'permission_callback' => [$this, 'check_api_key'],
                'args' => [
                    'email' => [
                        'required' => true,
                        'type' => 'string',
                        'validate_callback' => function($param) { return is_email($param); },
                    ],
                ],
            ],
        ]);

        // Update stato_software by email (works even if user has no APRI/CHIUDI signal yet)
        register_rest_route('trading/v1', '/users/status', [
            'methods'  => 'POST',
            'callback' => [$this, 'update_user_software_status'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($param) { return is_email($param); },
                ],
                'stato_software' => [
                    'required' => true,
                    'type'     => 'string',
                ],
                'automazione_attiva' => [
                    'required' => false,
                    'type'     => 'string', // '0' or '1'
                ],
                'account_mode' => [
                    'required' => false,
                    'type'     => 'string', // 'DEMO' or 'REAL'
                ],
            ],
        ]);

        // Update tipo_account (DEMO/REAL) by email (works even if user has no APRI/CHIUDI signal yet)
        register_rest_route('trading/v1', '/users/tipo-account', [
            'methods'  => 'POST',
            'callback' => [$this, 'update_user_tipo_account'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($param) { return is_email($param); },
                ],
                'tipo_account' => [
                    'required' => true,
                    'type'     => 'string',
                ],
            ],
        ]);

        // Admin-only stats endpoint for quick IP monitoring
        register_rest_route('trading/v1', '/admin/ip-stats', [
            'methods' => 'GET',
            'callback' => [$this, 'get_ip_stats'],
            'permission_callback' => [$this, 'check_admin_rest_access'],
            'args' => [
                'minutes' => [
                    'required' => false,
                    'type' => 'integer',
                ],
                'limit' => [
                    'required' => false,
                    'type' => 'integer',
                ],
            ],
        ]);

        // ── User operations (open/closed trade state) ──────────────────────

        // Record trade opened
        register_rest_route('trading/v1', '/operations/open', [
            'methods'  => 'POST',
            'callback' => [$this, 'record_operation_open'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($p) { return is_email($p); },
                ],
                'strike'        => [ 'required' => false ],
                'scadenza_data' => [ 'required' => false ],
                'scadenza_ora'  => [ 'required' => false ],
                'tipo_account'  => [ 'required' => false ],
            ],
        ]);

        // Record trade closed
        register_rest_route('trading/v1', '/operations/close', [
            'methods'  => 'POST',
            'callback' => [$this, 'record_operation_close'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($p) { return is_email($p); },
                ],
            ],
        ]);

        // Get operation state for a user
        register_rest_route('trading/v1', '/operations', [
            'methods'  => 'GET',
            'callback' => [$this, 'get_operation'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($p) { return is_email($p); },
                ],
            ],
        ]);

        // Get append-only operations history for a user
        register_rest_route('trading/v1', '/operations/history', [
            'methods'  => 'GET',
            'callback' => [$this, 'get_operations_history'],
            'permission_callback' => [$this, 'check_api_key'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type'     => 'string',
                    'validate_callback' => function($p) { return is_email($p); },
                ],
                'limit' => [ 'required' => false, 'type' => 'integer' ],
                'tipo_account' => [ 'required' => false, 'type' => 'string' ],
            ],
        ]);

        // Consent v2.0 — receive signed configuration document and dispatch email
        register_rest_route('trading/v1', '/consent-submit', [
            'methods'  => 'POST',
            'callback' => [$this, 'submit_consent'],
            'permission_callback' => [$this, 'check_api_key'],
        ]);

    }

    public function check_api_key($request) {
        $client_ip = $this->get_client_ip();

        if (!$this->is_ip_allowed($client_ip)) {
            $this->log_event('auth/ip-denied', 'AUTH', [
                'success' => 0,
                'reason'  => 'ip_not_allowed',
                'ip'      => $client_ip,
            ]);
            return new WP_Error('forbidden_ip', 'IP not allowed', ['status' => 403]);
        }

        if (!$this->check_rate_limit($client_ip)) {
            $this->log_event('auth/rate-limit', 'AUTH', [
                'success' => 0,
                'reason'  => 'rate_limited',
                'ip'      => $client_ip,
            ]);
            return new WP_Error('too_many_requests', 'Too many requests', ['status' => 429]);
        }

        $api_key  = $request->get_header('X-API-Key');
        $auth_context = $this->resolve_api_client($api_key);
        if (!$auth_context['authenticated']) {
            $this->log_event('auth/api-key', 'AUTH', [
                'success' => 0,
                'reason'  => 'invalid_api_key',
                'ip'      => $client_ip,
            ]);
            return new WP_Error('unauthorized', 'Invalid API key', ['status' => 401]);
        }

        if (!$auth_context['ip_allowed']) {
            $this->log_event('auth/client-ip-denied', 'AUTH', [
                'success' => 0,
                'reason'  => 'client_ip_not_allowed',
                'ip'      => $client_ip,
                'client'  => $auth_context['label'],
                'email'   => $auth_context['email'],
            ]);
            return new WP_Error('forbidden_ip', 'IP not allowed for this API key', ['status' => 403]);
        }

        $required_permission = $this->get_required_permission($request);
        if (!$this->client_has_permission($auth_context, $required_permission)) {
            $this->log_event('auth/permission-denied', 'AUTH', [
                'success'    => 0,
                'reason'     => 'permission_denied',
                'ip'         => $client_ip,
                'client'     => $auth_context['label'],
                'email'      => $auth_context['email'],
                'permission' => $required_permission,
            ]);
            return new WP_Error('forbidden', 'Permission denied for this API key', ['status' => 403]);
        }

        return true;
    }

    public function check_admin_rest_access($request) {
        if (current_user_can('manage_options')) {
            return true;
        }

        return new WP_Error('forbidden', 'Admin privileges required', ['status' => 403]);
    }

    /**
     * READ: return latest signals, optionally filtered by email.
     */
    public function get_pending_signals($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found. Set it in Settings → Trading API.', ['status' => 500]);
        }

        $email  = $request->get_param('email');
        $limit  = intval($request->get_param('limit'));
        if ($limit <= 0 || $limit > 100) $limit = 10;

        $sql    = "SELECT * FROM `$table` WHERE 1=1";
        $params = [];

        if (!empty($email)) {
            $sql .= " AND email = %s";
            $params[] = $email;
        }

        $orderCol = $this->column_exists($table, 'created_at') ? 'created_at' : 'id';
        $sql .= " ORDER BY `$orderCol` DESC LIMIT %d";
        $params[] = $limit;

        $prepared = $wpdb->prepare($sql, ...$params);
        $rows     = $wpdb->get_results($prepared, ARRAY_A);

        // Polling requests are intentionally not logged.
        // Connected client software calls this endpoint frequently, so logging it would fill the DB.

        return rest_ensure_response($rows ?: []);
    }

    /**
     * READ ALL users without limit (for admin panel)
     */
    public function get_all_signals($request) {
        global $wpdb;

        // Prevent page caches from serving stale admin/API data.
        // IMPORTANT: do NOT call wp_cache_flush() here. Flushing the full WP object cache
        // on every /signals/all request is expensive and can slow the entire site.
        nocache_headers();

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found. Set it in Settings → Trading API.', ['status' => 500]);
        }

        $log_table = $wpdb->prefix . 'avaopions_log';
        $orderCol = $this->column_exists($table, 'updated_at') ? 'updated_at' : 'id';

        // Check if log table exists to add ultima_operazione
        $log_table_exists = $wpdb->get_var("SHOW TABLES LIKE '$log_table'");

        if ($log_table_exists) {
            // Only the latest row per email (highest id), plus last APRI/CHIUDI from logs
            $sql = "SELECT s.*,
                    (SELECT l.segnale FROM `$log_table` l
                     WHERE l.email = s.email
                     AND l.segnale IN ('APRI', 'CHIUDI')
                     ORDER BY l.created_at DESC LIMIT 1) as ultima_operazione
                    FROM `$table` s
                    INNER JOIN (
                        SELECT MAX(id) AS max_id FROM `$table` GROUP BY email
                    ) latest ON s.id = latest.max_id
                    ORDER BY s.`$orderCol` DESC";
        } else {
            // Only the latest row per email (highest id)
            $sql = "SELECT s.* FROM `$table` s
                    INNER JOIN (
                        SELECT MAX(id) AS max_id FROM `$table` GROUP BY email
                    ) latest ON s.id = latest.max_id
                    ORDER BY s.`$orderCol` DESC";
        }
        
        $rows = $wpdb->get_results($sql, ARRAY_A);

        // Do not log this routine read endpoint by default.
        // Admin dashboards can call it often and logging it creates extra INSERTs.
        return rest_ensure_response($rows ?: []);
    }

    /**
     * LOG-ONLY: record that a client marked a signal as handled.
     */
    public function mark_signal_processed_log_only($request) {
        $signal_id = intval($request['id']);
        $success   = $request->get_param('success');

        $succ_val = null;
        if ($success !== null) {
            $succ_val = (in_array(strtolower((string)$success), ['1','true','yes','y','ok'], true)) ? 1 : 0;
        }

        $this->log_event('/signals/{id}/complete', 'POST', [
            'signal_id' => $signal_id,
            'success'   => $succ_val,
        ]);

        return rest_ensure_response([
            'success' => true,
            'message' => 'Logged completion (no DB update on signals table).'
        ]);
    }

    /**
     * Update or reset segnale (set to NULL).
     * Also supports updating tipo_account independently.
     * Also updates updated_at if the column exists.
     */
    public function update_signal_status($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found. Set it in Settings → Trading API.', ['status' => 500]);
        }

        $id            = intval($request['id']);
        $reset         = $request->get_param('reset');
        $value         = $request->get_param('segnale');
        $tipo_account  = $request->get_param('tipo_account');
        $stato_software = $request->get_param('stato_software');

        if ($id <= 0) {
            return new WP_Error('bad_request', 'Invalid id.', ['status' => 400]);
        }

        $has_updated_at       = $this->column_exists($table, 'updated_at');
        $has_tipo_account     = $this->column_exists($table, 'tipo_account');
        $has_stato_software   = $this->column_exists($table, 'stato_software');

        // ── Handle tipo_account update (can be combined with segnale or standalone) ──
        $tipo_updated = false;
        if ($tipo_account !== null && $tipo_account !== '' && $has_tipo_account) {
            $allowed_types = ['DEMO', 'REAL'];
            $tipo_val = strtoupper(sanitize_text_field($tipo_account));

            if (in_array($tipo_val, $allowed_types, true)) {
                $tipo_data   = ['tipo_account' => $tipo_val];
                $tipo_format = ['%s'];

                if ($has_updated_at) {
                    $tipo_data['updated_at'] = current_time('mysql');
                    $tipo_format[] = '%s';
                }

                $result = $wpdb->update($table, $tipo_data, ['id' => $id], $tipo_format, ['%d']);
                $tipo_updated = ($result !== false);

                $this->log_event('/signals/{id}/status', 'POST', [
                    'signal_id'    => $id,
                    'tipo_account' => $tipo_val,
                ]);
            }
        }

        // ── Handle stato_software update (can be combined with other fields or standalone) ──
        $stato_updated = false;
        if ($stato_software !== null && $stato_software !== '' && $has_stato_software) {
            $allowed_stati = ['offline', 'online'];
            $stato_val = strtolower(sanitize_text_field($stato_software));

            if (in_array($stato_val, $allowed_stati, true)) {
                $stato_data   = ['stato_software' => $stato_val];
                $stato_format = ['%s'];

                if ($has_updated_at) {
                    $stato_data['updated_at'] = current_time('mysql');
                    $stato_format[] = '%s';
                }

                $result = $wpdb->update($table, $stato_data, ['id' => $id], $stato_format, ['%d']);
                $stato_updated = ($result !== false);

                $this->log_event('/signals/{id}/status', 'POST', [
                    'signal_id'       => $id,
                    'stato_software'  => $stato_val,
                ]);
            }
        }

        // ── If only tipo_account and/or stato_software was requested (no segnale/reset), return early ──
        if (($value === null || $value === '') && ($reset === null || !in_array(strtolower((string)$reset), ['1','true','yes','y','reset'], true))) {
            if ($tipo_updated || $stato_updated) {
                $parts = [];
                if ($tipo_updated)  $parts[] = 'tipo_account updated';
                if ($stato_updated) $parts[] = 'stato_software updated';

                $response = [
                    'success' => true,
                    'message' => implode(', ', $parts) . '.',
                    'id'      => $id,
                ];
                if ($tipo_updated)  $response['tipo_account']    = strtoupper(sanitize_text_field($tipo_account));
                if ($stato_updated) $response['stato_software']  = strtolower(sanitize_text_field($stato_software));

                return rest_ensure_response($response);
            }

            // Nothing valid was provided
            if ($tipo_account !== null && !$has_tipo_account) {
                return new WP_Error('bad_request', 'Column tipo_account does not exist on the table.', ['status' => 400]);
            }
            if ($stato_software !== null && !$has_stato_software) {
                return new WP_Error('bad_request', 'Column stato_software does not exist on the table.', ['status' => 400]);
            }

            return new WP_Error('bad_request', 'Provide reset=1, segnale=<value>, tipo_account=<DEMO|REAL>, or stato_software=<online|offline>.', ['status' => 400]);
        }

        // ── Reset segnale to NULL ──
        if ($reset !== null && in_array(strtolower((string)$reset), ['1','true','yes','y','reset'], true)) {
            $sql = $has_updated_at
                ? $wpdb->prepare("UPDATE `$table` SET segnale = NULL, updated_at = %s WHERE id = %d", current_time('mysql'), $id)
                : $wpdb->prepare("UPDATE `$table` SET segnale = NULL WHERE id = %d", $id);

            $result = $wpdb->query($sql);

            $this->log_event('/signals/{id}/status', 'POST', [
                'signal_id' => $id,
                'reset'     => 1,
            ]);

            if ($result === false) {
                return new WP_Error('update_failed', 'Failed to reset segnale.', ['status' => 500]);
            }
            if ($wpdb->rows_affected === 0) {
                return new WP_Error('not_found', 'Signal not found or already reset.', ['status' => 404]);
            }

            $extra = [];
            if ($tipo_updated)  $extra[] = 'tipo_account also updated';
            if ($stato_updated) $extra[] = 'stato_software also updated';

            return rest_ensure_response([
                'success' => true,
                'message' => 'segnale reset to NULL.' . (!empty($extra) ? ' ' . implode(', ', $extra) . '.' : ''),
                'id'      => $id,
            ]);
        }

        // ── Update segnale to a new value ──
        if ($value === null || $value === '') {
            return new WP_Error('bad_request', 'Provide either reset=1 or segnale=<value>.', ['status' => 400]);
        }

        $new_val = sanitize_text_field($value);
        $data   = ['segnale' => $new_val];
        $format = ['%s'];

        if ($has_updated_at) {
            $data['updated_at'] = current_time('mysql');
            $format[] = '%s';
        }

        $result = $wpdb->update($table, $data, ['id' => $id], $format, ['%d']);

        $this->log_event('/signals/{id}/status', 'POST', [
            'signal_id' => $id,
            'segnale'   => $new_val,
        ]);

        if ($result === false) {
            return new WP_Error('update_failed', 'Failed to update segnale.', ['status' => 500]);
        }

        $extra = [];
        if ($tipo_updated)  $extra[] = 'tipo_account also updated';
        if ($stato_updated) $extra[] = 'stato_software also updated';

        return rest_ensure_response([
            'success' => true,
            'message' => ($result === 0 ? 'No changes (same value or id not found).' : 'segnale updated.') . (!empty($extra) ? ' ' . implode(', ', $extra) . '.' : ''),
            'id'      => $id,
            'segnale' => $new_val,
        ]);
    }

    /**
     * Get margin per contract for a user
     */
    public function get_margin_per_contract($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $email = $request->get_param('email');

        if (empty($email)) {
            return new WP_Error('missing_email', 'Email parameter is required', ['status' => 400]);
        }

        $result = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT margine_per_contratto, segnale, updated_at, livello_cliente 
                 FROM `$table` 
                 WHERE email = %s 
                 AND margine_per_contratto IS NOT NULL 
                 ORDER BY updated_at DESC 
                 LIMIT 1",
                $email
            ),
            ARRAY_A
        );

        if (!$result) {
            return new WP_Error('no_margin_data', 'No margin data found for this user', ['status' => 404]);
        }

        return rest_ensure_response([
            'success' => true,
            'email' => $email,
            'margin_per_contract' => floatval($result['margine_per_contratto']),
            'margin' => floatval($result['margine_per_contratto']),
            'signal' => $result['segnale'],
            'client_level' => $result['livello_cliente'],
            'last_updated' => $result['updated_at']
        ]);
    }

    /**
     * Sync real wallet level to client level in database
     * Maps livello_cliente_reale to appropriate livello_cliente tier
     */
    public function sync_real_level($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $email = $request->get_param('email');
        if (empty($email)) {
            return new WP_Error('missing_email', 'Email parameter is required', ['status' => 400]);
        }

        // Read user record with real wallet and account type
        $user = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT id, tipo_account, livello_cliente_reale, livello_cliente
                 FROM `$table`
                 WHERE email = %s
                 LIMIT 1",
                $email
            ),
            ARRAY_A
        );

        if (!$user) {
            return new WP_Error('user_not_found', 'User not found', ['status' => 404]);
        }

        // Only process REAL accounts with a real wallet value
        if ($user['tipo_account'] !== 'REAL' || empty($user['livello_cliente_reale'])) {
            return rest_ensure_response([
                'success' => false,
                'message' => 'Not a REAL account or no real wallet value',
                'account_type' => $user['tipo_account'],
                'real_wallet' => $user['livello_cliente_reale'],
                'current_level' => $user['livello_cliente']
            ]);
        }

        $walletAmount = floatval($user['livello_cliente_reale']);

        // Map wallet to tier
        $tier_map = [
            'Level I'    => ['min' =>   1000, 'max' =>   2000],
            'Level II'   => ['min' =>   2000, 'max' =>   3500],
            'Level III'  => ['min' =>   3500, 'max' =>   5000],
            'Level IV'   => ['min' =>   5000, 'max' =>   7500],
            'Level V'    => ['min' =>   7500, 'max' =>  10000],
            'Level VI'   => ['min' =>  10000, 'max' =>  15000],
            'Level VII'  => ['min' =>  15000, 'max' =>  20000],
            'Level VIII' => ['min' =>  20000, 'max' =>  30000],
            'Level IX'   => ['min' =>  30000, 'max' =>  40000],
            'Level X'    => ['min' =>  40000, 'max' =>  50000],
            'Level XI'   => ['min' =>  50000, 'max' =>  65000],
            'Level XII'  => ['min' =>  65000, 'max' =>  80000],
            'Level XIII' => ['min' =>  80000, 'max' => 100000],
            'Level XIV'  => ['min' => 100000, 'max' => 125000],
            'Level XV'   => ['min' => 125000, 'max' => 160000],
            'Level XVI'  => ['min' => 160000, 'max' => 200000],
            'Level XVII' => ['min' => 200000, 'max' => 250000],
            'Level XVIII'=> ['min' => 250000, 'max' => 320000],
            'Level XIX'  => ['min' => 320000, 'max' => 400000],
            'Level XX'   => ['min' => 400000, 'max' => 500000],
        ];

        // Default to 'Level I' for REAL accounts below the minimum tier (< 1000€).
        // 'Demo' is reserved for demo accounts only and is never assigned here.
        $newLevel = 'Level I';
        foreach ($tier_map as $level => $range) {
            if ($walletAmount >= $range['min'] && $walletAmount <= $range['max']) {
                $newLevel = $level;
                break;
            }
        }

        // Update livello_cliente in database if it changed
        if ($newLevel !== $user['livello_cliente']) {
            $has_updated_at = $this->column_exists($table, 'updated_at');
            $update_data = ['livello_cliente' => $newLevel];
            $update_format = ['%s'];

            if ($has_updated_at) {
                $update_data['updated_at'] = current_time('mysql');
                $update_format[] = '%s';
            }

            $result = $wpdb->update($table, $update_data, ['id' => $user['id']], $update_format, ['%d']);

            if ($result === false) {
                return new WP_Error('update_failed', 'Failed to update client level', ['status' => 500]);
            }

            $this->log_event('/sync-real-level', 'POST', [
                'email' => $email,
                'real_wallet' => $walletAmount,
                'old_level' => $user['livello_cliente'],
                'new_level' => $newLevel,
            ]);

            return rest_ensure_response([
                'success' => true,
                'message' => 'Client level updated',
                'email' => $email,
                'real_wallet' => $walletAmount,
                'old_level' => $user['livello_cliente'],
                'new_level' => $newLevel,
                'updated' => true
            ]);
        }

        return rest_ensure_response([
            'success' => true,
            'message' => 'Client level already correct',
            'email' => $email,
            'real_wallet' => $walletAmount,
            'level' => $newLevel,
            'updated' => false
        ]);
    }

    /**
     * Erase (set to NULL) selected fields on a record.
     */
    public function erase_signal_fields($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $id = intval($request['id']);
        if ($id <= 0) {
            return new WP_Error('bad_request', 'Invalid id.', ['status' => 400]);
        }

        $allowed = [
            'strike',
            'margine_per_contratto',
            'orario_scadenza',
            'giorni_a_scadenza',
            'giorno_scadenza',
            'tipo_ordine',
        ];

        // Gather requested fields
        $requested = [];

        // 1) from comma-separated "fields"
        $fields_csv = $request->get_param('fields');
        if (!empty($fields_csv)) {
            foreach (explode(',', $fields_csv) as $f) {
                $f = trim($f);
                if ($f !== '') $requested[] = $f;
            }
        }

        // 2) from individual flags
        foreach ($allowed as $col) {
            $flag = $request->get_param($col);
            if ($flag !== null && in_array(strtolower((string)$flag), ['1','true','yes','y','on'], true)) {
                $requested[] = $col;
            }
        }

        // 3) "all" flag clears all supported
        $all = $request->get_param('all');
        if ($all !== null && in_array(strtolower((string)$all), ['1','true','yes','y','on'], true)) {
            $requested = $allowed;
        }

        // De-duplicate & whitelist
        $requested = array_values(array_unique(array_intersect($requested, $allowed)));

        if (empty($requested)) {
            return new WP_Error(
                'bad_request',
                'Specify fields to erase via fields=... or flags, or all=1.',
                ['status' => 400]
            );
        }

        // Build dynamic UPDATE ... SET col=NULL, ...
        $sets = [];
        foreach ($requested as $col) {
            if ($this->column_exists($table, $col)) {
                $sets[] = "`$col` = NULL";
            }
        }

        if (empty($sets)) {
            return new WP_Error('bad_request', 'Requested columns do not exist on this table.', ['status' => 400]);
        }

        $has_updated_at = $this->column_exists($table, 'updated_at');
        if ($has_updated_at) {
            $sets[] = $wpdb->prepare("`updated_at` = %s", current_time('mysql'));
        }

        $set_sql = implode(', ', $sets);
        $sql = $wpdb->prepare("UPDATE `$table` SET $set_sql WHERE id = %d", $id);
        $result = $wpdb->query($sql);

        $this->log_event('/signals/{id}/erase', 'POST', [
            'signal_id' => $id,
            'erased'    => $requested,
        ]);

        if ($result === false) {
            return new WP_Error('update_failed', 'Failed to erase fields.', ['status' => 500]);
        }
        if ($wpdb->rows_affected === 0) {
            return new WP_Error('not_found', 'Signal not found or no changes were necessary.', ['status' => 404]);
        }

        return rest_ensure_response([
            'success' => true,
            'message' => 'Fields erased (set to NULL).',
            'id'      => $id,
            'erased'  => $requested,
        ]);
    }

    /**
     * Update stato_software for a user, looked up by email.
     * Works for newly registered users that do not yet have any APRI/CHIUDI signal.
     */
    public function update_user_software_status($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        if (!$this->column_exists($table, 'stato_software')) {
            return new WP_Error('bad_request', 'Column stato_software does not exist on the table.', ['status' => 400]);
        }

        $email = trim(sanitize_email((string)$request->get_param('email')));
        $stato = strtolower(sanitize_text_field((string)$request->get_param('stato_software')));
        $auto_raw    = $request->get_param('automazione_attiva');
        $acct_raw    = $request->get_param('account_mode');

        if (empty($email)) {
            return new WP_Error('missing_email', 'Email parameter is required', ['status' => 400]);
        }

        if (!in_array($stato, ['online', 'offline'], true)) {
            return new WP_Error('bad_request', 'stato_software must be online or offline.', ['status' => 400]);
        }

        // Validate optional automazione_attiva (0 or 1)
        $auto_val = null;
        if ($auto_raw !== null && $auto_raw !== '') {
            $auto_val = in_array((string)$auto_raw, ['0', '1'], true) ? (int)$auto_raw : null;
        }

        // Validate optional account_mode (DEMO or REAL)
        $acct_val = null;
        if ($acct_raw !== null && $acct_raw !== '') {
            $acct_val = in_array(strtoupper(sanitize_text_field($acct_raw)), ['DEMO', 'REAL'], true)
                        ? strtoupper(sanitize_text_field($acct_raw)) : null;
        }

        // Auto-create automazione_attiva column if missing
        if ($auto_val !== null && !$this->column_exists($table, 'automazione_attiva')) {
            $wpdb->query("ALTER TABLE `$table` ADD COLUMN IF NOT EXISTS `automazione_attiva` TINYINT(1) DEFAULT 0");
        }

        $data   = ['stato_software' => $stato];
        $format = ['%s'];

        if ($auto_val !== null && $this->column_exists($table, 'automazione_attiva')) {
            $data['automazione_attiva'] = $auto_val;
            $format[] = '%d';
        }
        if ($acct_val !== null && $this->column_exists($table, 'tipo_account')) {
            $data['tipo_account'] = $acct_val;
            $format[] = '%s';
        }

        if ($this->column_exists($table, 'updated_at')) {
            $data['updated_at'] = current_time('mysql');
            $format[] = '%s';
        }

        // Update directly by email — avoids a separate SELECT and works regardless of
        // whether resolve_table_name returns a prefixed or un-prefixed table variant.
        $result = $wpdb->update($table, $data, ['email' => $email], $format, ['%s']);

        if ($result === false) {
            return new WP_Error('update_failed', 'Failed to update stato_software.', ['status' => 500]);
        }

        if ($result > 0) {
            // Row found and updated in signals table.
            $updated_row = $wpdb->get_row(
                $wpdb->prepare("SELECT id FROM `$table` WHERE email = %s ORDER BY id DESC LIMIT 1", $email),
                ARRAY_A
            );

            $this->log_event('/users/status', 'POST', [
                'email'               => $email,
                'signal_id'           => $updated_row ? intval($updated_row['id']) : null,
                'stato_software'      => $stato,
                'automazione_attiva'  => $auto_val,
                'account_mode'        => $acct_val,
                'success'             => 1,
            ]);

            return rest_ensure_response([
                'success'             => true,
                'email'               => $email,
                'id'                  => $updated_row ? intval($updated_row['id']) : null,
                'stato_software'      => $stato,
                'automazione_attiva'  => $auto_val,
                'account_mode'        => $acct_val,
                'updated'             => true,
            ]);
        }

        // rows_affected = 0: no row in signals table for this email.
        // Fall back to wp_usermeta for users not yet in the signals table.
        // Also try a direct query against the literal 'user_signals' table (no prefix) as
        // a safeguard in case resolve_table_name picked a prefixed-but-empty variant.
        if ($table !== 'user_signals') {
            global $wpdb;
            $fallback_result = $wpdb->update('user_signals', $data, ['email' => $email], $format, ['%s']);
            if ($fallback_result !== false && $wpdb->rows_affected > 0) {
                $this->log_event('/users/status', 'POST', [
                    'email'              => $email,
                    'stato_software'     => $stato,
                    'automazione_attiva' => $auto_val,
                    'account_mode'       => $acct_val,
                    'success'            => 1,
                    'source'             => 'user_signals_direct',
                ]);
                return rest_ensure_response([
                    'success'            => true,
                    'email'              => $email,
                    'id'                 => null,
                    'stato_software'     => $stato,
                    'automazione_attiva' => $auto_val,
                    'account_mode'       => $acct_val,
                    'updated'            => true,
                    'source'             => 'user_signals_direct',
                ]);
            }
        }

        $wp_user = get_user_by('email', $email);
        if (!$wp_user) {
            // Debug: include DB name and resolved table to diagnose mismatches
            $debug_select = $wpdb->get_var(
                $wpdb->prepare("SELECT COUNT(*) FROM `$table` WHERE email = %s", $email)
            );
            return new WP_Error('user_not_found',
                sprintf(
                    'No user found. DB=%s table=%s email_count=%s last_error=%s',
                    $wpdb->dbname,
                    $table,
                    (string)$debug_select,
                    $wpdb->last_error
                ),
                ['status' => 404]
            );
        }
        update_user_meta($wp_user->ID, 'stato_software', $stato);
        update_user_meta($wp_user->ID, 'stato_software_updated_at', current_time('mysql'));
        if ($auto_val !== null) update_user_meta($wp_user->ID, 'automazione_attiva', $auto_val);
        if ($acct_val !== null) update_user_meta($wp_user->ID, 'account_mode', $acct_val);

        $this->log_event('/users/status', 'POST', [
            'email'              => $email,
            'signal_id'          => null,
            'stato_software'     => $stato,
            'automazione_attiva' => $auto_val,
            'account_mode'       => $acct_val,
            'success'            => 1,
            'source'             => 'wp_usermeta',
        ]);

        return rest_ensure_response([
            'success'            => true,
            'email'              => $email,
            'id'                 => null,
            'stato_software'     => $stato,
            'automazione_attiva' => $auto_val,
            'account_mode'       => $acct_val,
            'updated'            => true,
            'source'             => 'wp_usermeta',
        ]);
    }

    /**
     * Update tipo_account (DEMO/REAL) for a user, looked up by email.
     * Works even if the user does not yet have any APRI/CHIUDI signal.
     */
    public function update_user_tipo_account($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        if (!$this->column_exists($table, 'tipo_account')) {
            return new WP_Error('bad_request', 'Column tipo_account does not exist on the table.', ['status' => 400]);
        }

        $email = sanitize_email($request->get_param('email'));
        $tipo  = strtoupper(sanitize_text_field((string)$request->get_param('tipo_account')));

        if (empty($email)) {
            return new WP_Error('missing_email', 'Email parameter is required', ['status' => 400]);
        }

        if (!in_array($tipo, ['DEMO', 'REAL'], true)) {
            return new WP_Error('bad_request', 'tipo_account must be DEMO or REAL.', ['status' => 400]);
        }

        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT id FROM `$table` WHERE email = %s ORDER BY id DESC LIMIT 1", $email),
            ARRAY_A
        );

        if (!$row) {
            return new WP_Error('user_not_found', 'No row found for this email', ['status' => 404]);
        }

        $data   = ['tipo_account' => $tipo];
        $format = ['%s'];

        if ($this->column_exists($table, 'updated_at')) {
            $data['updated_at'] = current_time('mysql');
            $format[] = '%s';
        }

        $result = $wpdb->update($table, $data, ['id' => $row['id']], $format, ['%d']);

        $this->log_event('/users/tipo-account', 'POST', [
            'email'        => $email,
            'signal_id'    => intval($row['id']),
            'tipo_account' => $tipo,
            'success'      => ($result === false) ? 0 : 1,
        ]);

        if ($result === false) {
            return new WP_Error('update_failed', 'Failed to update tipo_account.', ['status' => 500]);
        }

        return rest_ensure_response([
            'success'      => true,
            'email'        => $email,
            'id'           => intval($row['id']),
            'tipo_account' => $tipo,
            'updated'      => ($result > 0),
        ]);
    }

    /**
     * Admin-only endpoint to inspect the most active client IPs in recent logs.
     */
    public function get_ip_stats($request) {
        global $wpdb;

        $logs_table = $wpdb->prefix . self::LOGS_TABLE_SUFFIX;
        if (!$this->table_exists($logs_table)) {
            return new WP_Error('table_not_found', 'Logs table not found.', ['status' => 500]);
        }

        $minutes = intval($request->get_param('minutes'));
        if ($minutes <= 0) $minutes = 60;
        if ($minutes > 10080) $minutes = 10080; // 7 days

        $limit = intval($request->get_param('limit'));
        if ($limit <= 0) $limit = 20;
        if ($limit > 200) $limit = 200;

        $window_start = gmdate('Y-m-d H:i:s', time() - ($minutes * 60));

        $sql = $wpdb->prepare(
            "SELECT
                ip,
                COUNT(*) AS total_requests,
                SUM(CASE WHEN method = 'AUTH' THEN 1 ELSE 0 END) AS auth_events,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS denied_requests,
                MAX(created_at) AS last_seen
             FROM `$logs_table`
             WHERE created_at >= %s
               AND ip IS NOT NULL
               AND ip <> ''
             GROUP BY ip
             ORDER BY total_requests DESC, last_seen DESC
             LIMIT %d",
            $window_start,
            $limit
        );

        $rows = $wpdb->get_results($sql, ARRAY_A);

        return rest_ensure_response([
            'success' => true,
            'window_minutes' => $minutes,
            'window_start_utc' => $window_start,
            'limit' => $limit,
            'count' => is_array($rows) ? count($rows) : 0,
            'items' => $rows ?: [],
        ]);
    }

    /**
     * Send order to user - updates multiple fields on the signal
     */
    public function send_order($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $id = intval($request['id']);
        if ($id <= 0) {
            return new WP_Error('bad_request', 'Invalid id.', ['status' => 400]);
        }

        // Get all possible order fields from request
        $fields = [
            'segnale' => $request->get_param('segnale'),
            'strike' => $request->get_param('strike'),
            'margine_per_contratto' => $request->get_param('margine_per_contratto'),
            'orario_scadenza' => $request->get_param('orario_scadenza'),
            'giorni_a_scadenza' => $request->get_param('giorni_a_scadenza'),
            'giorno_scadenza' => $request->get_param('giorno_scadenza'),
            'tipo_ordine' => $request->get_param('tipo_ordine'),
        ];

        $data = [];
        $format = [];

        foreach ($fields as $col => $val) {
            if ($val !== null && $val !== '' && $this->column_exists($table, $col)) {
                $data[$col] = sanitize_text_field($val);
                $format[] = is_numeric($val) ? '%s' : '%s'; // All as strings for flexibility
            }
        }

        if (empty($data)) {
            return new WP_Error('bad_request', 'No valid fields provided.', ['status' => 400]);
        }

        // Add updated_at if exists
        if ($this->column_exists($table, 'updated_at')) {
            $data['updated_at'] = current_time('mysql');
            $format[] = '%s';
        }

        $result = $wpdb->update($table, $data, ['id' => $id], $format, ['%d']);

        $this->log_event('/signals/{id}/order', 'POST', [
            'signal_id' => $id,
            'fields' => array_keys($data),
        ]);

        if ($result === false) {
            return new WP_Error('update_failed', 'Failed to send order.', ['status' => 500]);
        }

        return rest_ensure_response([
            'success' => true,
            'message' => 'Order sent.',
            'id' => $id,
            'updated_fields' => array_keys($data),
        ]);
    }

    /**
     * Create a new user or update an existing one in user_signals.
     * Required: email, nome_completo.
     * Optional: tipo_account, livello_cliente, margine_per_contratto, ava_username, ava_password.
     * If update=true, updates an existing record instead of creating.
     */
    public function create_or_update_user($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $body = $request->get_json_params();

        $email         = isset($body['email'])         ? sanitize_email(trim($body['email']))          : '';
        $nome          = isset($body['nome_completo'])  ? sanitize_text_field(trim($body['nome_completo'])) : '';
        $is_update     = !empty($body['update']);

        if (empty($email) || !is_email($email)) {
            return new WP_Error('bad_request', 'Email valida richiesta.', ['status' => 400]);
        }
        if (!$is_update && empty($nome)) {
            return new WP_Error('bad_request', 'Nome completo richiesto.', ['status' => 400]);
        }

        // Check if the user already exists
        $existing = $wpdb->get_row(
            $wpdb->prepare("SELECT id FROM `$table` WHERE email = %s LIMIT 1", $email),
            ARRAY_A
        );

        if (!$is_update && $existing) {
            return new WP_Error('conflict', 'Esiste già un utente con questa email.', ['status' => 409]);
        }
        if ($is_update && !$existing) {
            return new WP_Error('not_found', 'Utente non trovato.', ['status' => 404]);
        }

        // Build data array from optional fields
        $data   = [];
        $format = [];

        if (!empty($nome)) {
            $data['nome_completo'] = $nome;
            $format[] = '%s';
        }

        $tipo = isset($body['tipo_account']) ? strtoupper(sanitize_text_field($body['tipo_account'])) : null;
        if ($tipo && in_array($tipo, ['DEMO', 'REAL'], true) && $this->column_exists($table, 'tipo_account')) {
            $data['tipo_account'] = $tipo;
            $format[] = '%s';
        }

        $livello = isset($body['livello_cliente']) ? sanitize_text_field($body['livello_cliente']) : null;
        if ($livello !== null && $livello !== '' && $this->column_exists($table, 'livello_cliente')) {
            $data['livello_cliente'] = $livello;
            $format[] = '%s';
        }

        $margine = isset($body['margine_per_contratto']) ? $body['margine_per_contratto'] : null;
        if ($margine !== null && is_numeric($margine) && $this->column_exists($table, 'margine_per_contratto')) {
            $data['margine_per_contratto'] = floatval($margine);
            $format[] = '%f';
        }

        if ($this->column_exists($table, 'ava_username') && isset($body['ava_username'])) {
            $data['ava_username'] = sanitize_text_field($body['ava_username']);
            $format[] = '%s';
        }

        if ($this->column_exists($table, 'ava_password') && isset($body['ava_password'])) {
            $data['ava_password'] = $body['ava_password']; // store as-is (plain text, encrypted at rest by DB)
            $format[] = '%s';
        }

        if ($this->column_exists($table, 'updated_at')) {
            $data['updated_at'] = current_time('mysql');
            $format[] = '%s';
        }

        if ($is_update) {
            if (empty($data)) {
                return new WP_Error('bad_request', 'Nessun campo da aggiornare.', ['status' => 400]);
            }
            $result = $wpdb->update($table, $data, ['id' => intval($existing['id'])], $format, ['%d']);

            $this->log_event('/signals/user', 'POST (update)', [
                'email'   => $email,
                'fields'  => array_keys($data),
            ]);

            return rest_ensure_response(['success' => true, 'action' => 'updated', 'email' => $email]);
        }

        // INSERT new user
        $data['email'] = $email;
        $format[] = '%s';

        // Defaults for new users
        if (!isset($data['tipo_account']) && $this->column_exists($table, 'tipo_account')) {
            $data['tipo_account'] = 'DEMO';
            $format[] = '%s';
        }
        if (!isset($data['livello_cliente']) && $this->column_exists($table, 'livello_cliente')) {
            $data['livello_cliente'] = 'Standard';
            $format[] = '%s';
        }
        if ($this->column_exists($table, 'stato_software')) {
            $data['stato_software'] = 'offline';
            $format[] = '%s';
        }
        if ($this->column_exists($table, 'created_at')) {
            $data['created_at'] = current_time('mysql');
            $format[] = '%s';
        }

        $result = $wpdb->insert($table, $data, $format);

        if ($result === false) {
            return new WP_Error('insert_failed', 'Errore durante la creazione dell\'utente: ' . $wpdb->last_error, ['status' => 500]);
        }

        $this->log_event('/signals/user', 'POST (create)', [
            'email' => $email,
            'id'    => $wpdb->insert_id,
        ]);

        return rest_ensure_response([
            'success' => true,
            'action'  => 'created',
            'id'      => $wpdb->insert_id,
            'email'   => $email,
        ]);
    }

    /**
     * Delete a user from user_signals by email.
     */
    public function delete_user($request) {
        global $wpdb;

        $table = $this->resolve_table_name();
        if (!$table) {
            return new WP_Error('table_not_found', 'Signals table not found.', ['status' => 500]);
        }

        $email = sanitize_email($request->get_param('email'));
        if (empty($email)) {
            return new WP_Error('bad_request', 'Email richiesta.', ['status' => 400]);
        }

        $existing = $wpdb->get_row(
            $wpdb->prepare("SELECT id FROM `$table` WHERE email = %s LIMIT 1", $email),
            ARRAY_A
        );
        if (!$existing) {
            return new WP_Error('not_found', 'Utente non trovato.', ['status' => 404]);
        }

        $result = $wpdb->delete($table, ['email' => $email], ['%s']);

        if ($result === false) {
            return new WP_Error('delete_failed', 'Errore durante l\'eliminazione.', ['status' => 500]);
        }

        $this->log_event('/signals/user', 'DELETE', ['email' => $email]);

        return rest_ensure_response(['success' => true, 'deleted_email' => $email]);
    }

    /**
     * Get logs from trading_api_logs table
     */
    public function get_logs($request) {
        global $wpdb;

        $limit = intval($request->get_param('limit'));
        if ($limit <= 0) $limit = 100;
        if ($limit > 200) $limit = 200; // protect DB/CPU on shared hosting

        $logs_table = $wpdb->prefix . self::LOGS_TABLE_SUFFIX;
        
        if (!$this->table_exists($logs_table)) {
            return new WP_Error('table_not_found', 'Logs table not found.', ['status' => 500]);
        }

        $sql = $wpdb->prepare(
            "SELECT * FROM `$logs_table` ORDER BY created_at DESC LIMIT %d",
            $limit
        );
        
        $rows = $wpdb->get_results($sql, ARRAY_A);

        return rest_ensure_response($rows ?: []);
    }

    /* -----------------------------
     * Admin UI
     * ----------------------------- */
    public function admin_menu() {
        add_options_page(
            'Trading Signals API',
            'Trading API',
            'manage_options',
            'trading-signals-api',
            [$this, 'admin_page']
        );
    }

    public function admin_page() {
        if (!current_user_can('manage_options')) return;

        $notice = '';
        $generated_client_key = '';
        $generated_client_meta = null;

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            if (isset($_POST['create_client_key'])) {
                check_admin_referer('trading_api_client_keys');

                $label = sanitize_text_field($_POST['client_label'] ?? '');
                $email = sanitize_email($_POST['client_email'] ?? '');
                $allowed_ips = $this->normalize_ip_list_string(wp_unslash($_POST['client_allowed_ips'] ?? ''));
                $permissions = $this->sanitize_permissions($_POST['client_permissions'] ?? []);
                $send_email = !empty($_POST['send_client_key_email']);

                if ($label === '') {
                    $notice = 'Client label is required.';
                } elseif ($email !== '' && !is_email($email)) {
                    $notice = 'Client email is not valid.';
                } else {
                    $new_key = $this->generate_api_key();
                    $keys = $this->get_client_keys();
                    $new_client = [
                        'id' => wp_generate_uuid4(),
                        'label' => $label,
                        'email' => $email,
                        'api_key_hash' => $this->hash_api_key($new_key),
                        'api_key_prefix' => substr($new_key, 0, 8),
                        'status' => 'active',
                        'allowed_ips' => $allowed_ips,
                        'permissions' => $permissions,
                        'created_at' => current_time('mysql'),
                    ];
                    $keys[] = $new_client;
                    $this->save_client_keys($keys);
                    $generated_client_key = $new_key;
                    $generated_client_meta = $new_client;
                    $notice = 'Client API key generated.';

                    if ($send_email && $email !== '') {
                        $mail_sent = $this->send_client_key_email($email, $label, $new_key, $new_client);
                        $notice .= $mail_sent ? ' Email sent successfully.' : ' Email delivery failed.';
                    }
                }
            } elseif (isset($_POST['regenerate_client_key'])) {
                check_admin_referer('trading_api_client_keys');

                $client_id = sanitize_text_field($_POST['client_id'] ?? '');
                $send_email = !empty($_POST['send_client_key_email']);
                $keys = $this->get_client_keys();
                $updated = false;

                foreach ($keys as &$key) {
                    if (($key['id'] ?? '') !== $client_id) {
                        continue;
                    }

                    $new_key = $this->generate_api_key();
                    $key['api_key_hash'] = $this->hash_api_key($new_key);
                    $key['api_key_prefix'] = substr($new_key, 0, 8);
                    $key['status'] = 'active';
                    $key['rotated_at'] = current_time('mysql');

                    $generated_client_key = $new_key;
                    $generated_client_meta = $key;
                    $notice = 'Client API key regenerated.';

                    if ($send_email && !empty($key['email'])) {
                        $mail_sent = $this->send_client_key_email($key['email'], $key['label'] ?? 'Client', $new_key, $key);
                        $notice .= $mail_sent ? ' Email sent successfully.' : ' Email delivery failed.';
                    }

                    $updated = true;
                    break;
                }
                unset($key);

                if ($updated) {
                    $this->save_client_keys($keys);
                } else {
                    $notice = 'Client API key not found.';
                }
            } elseif (isset($_POST['toggle_client_key'])) {
                check_admin_referer('trading_api_client_keys');

                $client_id = sanitize_text_field($_POST['client_id'] ?? '');
                $target_status = sanitize_text_field($_POST['target_status'] ?? 'revoked');
                $keys = $this->get_client_keys();
                $updated = false;

                foreach ($keys as &$key) {
                    if (($key['id'] ?? '') === $client_id) {
                        $key['status'] = ($target_status === 'active') ? 'active' : 'revoked';
                        $updated = true;
                        break;
                    }
                }
                unset($key);

                if ($updated) {
                    $this->save_client_keys($keys);
                    $notice = 'Client API key updated.';
                }
            } elseif (isset($_POST['save_table_base'])) {
                check_admin_referer('trading_api_tablebase');
                $base = sanitize_text_field($_POST['table_base'] ?? '');
                if ($base) {
                    update_option(self::OPTION_TABLE_BASENAME, $base);
                    $notice = 'Signals table base name saved.';
                }
            } elseif (isset($_POST['save_security_settings'])) {
                check_admin_referer('trading_api_security');

                $allowed_ips_raw = wp_unslash($_POST['allowed_ips'] ?? '');
                $allowed_lines = preg_split('/[\r\n,]+/', (string)$allowed_ips_raw);
                $validated = [];

                foreach ($allowed_lines as $line) {
                    $ip = trim($line);
                    if ($ip === '') {
                        continue;
                    }
                    if (filter_var($ip, FILTER_VALIDATE_IP)) {
                        $validated[] = $ip;
                    }
                }

                $rate_limit = intval($_POST['rate_limit_pm'] ?? 120);
                if ($rate_limit < 10) $rate_limit = 10;
                if ($rate_limit > 2000) $rate_limit = 2000;

                update_option(self::OPTION_ALLOWED_IPS, implode("\n", array_values(array_unique($validated))));
                update_option(self::OPTION_RATE_LIMIT_PM, $rate_limit);
                $notice = 'Security settings saved.';
            }
        }

        $client_keys = $this->get_client_keys();
        $base_name  = get_option(self::OPTION_TABLE_BASENAME, 'user_signals');
        $allowed_ips = get_option(self::OPTION_ALLOWED_IPS, '');
        $rate_limit_pm = intval(get_option(self::OPTION_RATE_LIMIT_PM, 120));
        $resolved   = $this->resolve_table_name(false);
        $endpoint   = rest_url('trading/v1/signals/pending');

        ?>
        <div class="wrap">
            <h1>Trading Signals API v2.0</h1>

            <?php if ($notice): ?>
                <div class="notice notice-success"><p><?php echo esc_html($notice); ?></p></div>
            <?php endif; ?>

            <?php if ($generated_client_key): ?>
                <div class="notice notice-warning">
                    <p><strong>Client API key:</strong> <code id="generated-client-key"><?php echo esc_html($generated_client_key); ?></code></p>
                    <p>
                        <button type="button" class="button button-secondary" onclick="navigator.clipboard.writeText(document.getElementById('generated-client-key').textContent)">Copy key</button>
                        <?php if ($generated_client_meta): ?>
                            <a class="button button-secondary" download="<?php echo esc_attr($this->build_client_config_filename($generated_client_meta)); ?>" href="data:text/plain;charset=utf-8,<?php echo rawurlencode($this->build_client_config_content($generated_client_key, $generated_client_meta)); ?>">Download config</a>
                        <?php endif; ?>
                    </p>
                    <p>Copy or download it now. The full key will not be shown again.</p>
                </div>
            <?php endif; ?>

            <h2>API Configuration</h2>
            <table class="form-table">
                <tr>
                    <th>API Endpoint (read):</th>
                    <td><code><?php echo esc_url($endpoint); ?></code></td>
                </tr>
                <tr>
                    <th>Authentication mode:</th>
                    <td>
                        <strong>Client API keys only</strong>
                        <p class="description">The legacy global API key is no longer accepted. Generate one key per client below.</p>
                    </td>
                </tr>
            </table>

            <h2>Signals Table</h2>
            <form method="post">
                <?php wp_nonce_field('trading_api_tablebase'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">Base name (no prefix)</th>
                        <td>
                            <input type="text" name="table_base" value="<?php echo esc_attr($base_name); ?>" class="regular-text" />
                            <p class="description">Example: <code>user_signals</code>. The plugin looks for <code><?php echo esc_html($this->db_prefix()); ?><?php echo esc_html($base_name); ?></code>, then <code><?php echo esc_html($base_name); ?></code>.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Resolved table</th>
                        <td>
                            <code><?php echo esc_html($resolved ?: '(not found)'); ?></code>
                        </td>
                    </tr>
                </table>
                <p><input type="submit" name="save_table_base" class="button button-primary" value="Save table base name"></p>
            </form>

            <h2>Client API Keys</h2>
            <form method="post">
                <?php wp_nonce_field('trading_api_client_keys'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">Client label</th>
                        <td><input type="text" name="client_label" class="regular-text" placeholder="Cliente Mario" required></td>
                    </tr>
                    <tr>
                        <th scope="row">Client email</th>
                        <td><input type="email" name="client_email" class="regular-text" placeholder="cliente@example.com"></td>
                    </tr>
                    <tr>
                        <th scope="row">Allowed IPs for this key</th>
                        <td>
                            <textarea name="client_allowed_ips" rows="4" class="large-text code" placeholder="203.0.113.10\n198.51.100.25"></textarea>
                            <p class="description">Optional. Leave empty to inherit only the global IP rules.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Permissions</th>
                        <td>
                            <label><input type="checkbox" name="client_permissions[]" value="read" checked> Read</label><br>
                            <label><input type="checkbox" name="client_permissions[]" value="write" checked> Write</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Delivery</th>
                        <td>
                            <label><input type="checkbox" name="send_client_key_email" value="1"> Send key by email immediately</label>
                            <p class="description">Requires a valid client email and working WordPress email delivery.</p>
                        </td>
                    </tr>
                </table>
                <p><input type="submit" name="create_client_key" class="button button-primary" value="Generate client API key"></p>
            </form>

            <h3>Active Client Keys</h3>
            <?php if (!empty($client_keys)): ?>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th>Label</th>
                            <th>Email</th>
                            <th>Key Prefix</th>
                            <th>Status</th>
                            <th>Permissions</th>
                            <th>Allowed IPs</th>
                            <th>Created</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($client_keys as $client_key): ?>
                            <tr>
                                <td><?php echo esc_html($client_key['label'] ?? ''); ?></td>
                                <td><?php echo esc_html($client_key['email'] ?? ''); ?></td>
                                <td><code><?php echo esc_html($client_key['api_key_prefix'] ?? ''); ?>...</code></td>
                                <td><?php echo esc_html($client_key['status'] ?? 'revoked'); ?></td>
                                <td><?php echo esc_html(implode(', ', $client_key['permissions'] ?? [])); ?></td>
                                <td><code><?php echo esc_html($client_key['allowed_ips'] ?? ''); ?></code></td>
                                <td><?php echo esc_html(($client_key['rotated_at'] ?? '') ?: ($client_key['created_at'] ?? '')); ?></td>
                                <td>
                                    <form method="post">
                                        <?php wp_nonce_field('trading_api_client_keys'); ?>
                                        <input type="hidden" name="client_id" value="<?php echo esc_attr($client_key['id'] ?? ''); ?>">
                                        <input type="hidden" name="target_status" value="<?php echo (($client_key['status'] ?? '') === 'active') ? 'revoked' : 'active'; ?>">
                                        <input type="submit" name="toggle_client_key" class="button button-secondary" value="<?php echo (($client_key['status'] ?? '') === 'active') ? 'Revoke' : 'Activate'; ?>">
                                    </form>
                                    <form method="post" style="margin-top:8px;">
                                        <?php wp_nonce_field('trading_api_client_keys'); ?>
                                        <input type="hidden" name="client_id" value="<?php echo esc_attr($client_key['id'] ?? ''); ?>">
                                        <label style="display:block;margin-bottom:6px;">
                                            <input type="checkbox" name="send_client_key_email" value="1"> Email
                                        </label>
                                        <input type="submit" name="regenerate_client_key" class="button button-secondary" value="Regenerate">
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php else: ?>
                <p>No client API keys generated yet.</p>
            <?php endif; ?>

            <h2>Security</h2>
            <form method="post">
                <?php wp_nonce_field('trading_api_security'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">Allowed IPs</th>
                        <td>
                            <textarea name="allowed_ips" rows="6" class="large-text code" placeholder="203.0.113.10\n198.51.100.25"><?php echo esc_textarea((string)$allowed_ips); ?></textarea>
                            <p class="description">Leave empty to allow all IPs. One IP per line (IPv4/IPv6), or comma-separated.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Rate Limit (requests/min per IP)</th>
                        <td>
                            <input type="number" min="10" max="2000" name="rate_limit_pm" value="<?php echo esc_attr($rate_limit_pm); ?>" class="small-text" />
                            <p class="description">Recommended: 60-180. Applies before API key validation.</p>
                        </td>
                    </tr>
                </table>
                <p><input type="submit" name="save_security_settings" class="button button-primary" value="Save security settings"></p>
            </form>

            <h2>Usage Examples</h2>
            <pre>
# Read signals (optional: ?email=..., &limit=...)
curl -H "X-API-Key: YOUR_KEY" \
     "<?php echo esc_url(rest_url('trading/v1/signals/pending')); ?>?email=user@example.com"

# Update segnale
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "segnale=APRI" \
     "<?php echo esc_url(rest_url('trading/v1/signals/123/status')); ?>"

# Reset segnale (set to NULL)
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "reset=1" \
     "<?php echo esc_url(rest_url('trading/v1/signals/123/status')); ?>"

# Update tipo_account (DEMO or REAL) — by signal id
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "tipo_account=REAL" \
     "<?php echo esc_url(rest_url('trading/v1/signals/123/status')); ?>"

# Update tipo_account (DEMO or REAL) — by email (works without pending signals) ← NEW in v1.8
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "email=user@example.com&tipo_account=REAL" \
     "<?php echo esc_url(rest_url('trading/v1/users/tipo-account')); ?>"

# Update stato_software (online or offline)
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "stato_software=online" \
     "<?php echo esc_url(rest_url('trading/v1/signals/123/status')); ?>"

# Erase fields
curl -X POST -H "X-API-Key: YOUR_KEY" \
     -d "fields=strike,margine_per_contratto" \
     "<?php echo esc_url(rest_url('trading/v1/signals/123/erase')); ?>"

# Admin (logged-in WP admin): top active IPs in last 60 minutes
curl -b wordpress_logged_in_cookie \
    "<?php echo esc_url(rest_url('trading/v1/admin/ip-stats')); ?>?minutes=60&limit=20"
            </pre>
        </div>
        <?php
    }

    public function api_key_notice() {
        $notice = get_transient('trading_api_key_notice');
        if ($notice) {
            ?>
            <div class="notice notice-success">
                <p><strong>Trading Signals API Activated!</strong></p>
                <p>Generate one client API key for each VPS or user from the Trading API settings page.</p>
                <p>API Endpoint: <code><?php echo esc_url(rest_url('trading/v1/signals/pending')); ?></code></p>
            </div>
            <?php
            delete_transient('trading_api_key_notice');
        }
    }

    /* -----------------------------
     * User operations (trade state memory)
     * ----------------------------- */

    private function operations_table() {
        global $wpdb;
        return $wpdb->prefix . 'user_operations';
    }

    private function operations_history_table() {
        global $wpdb;
        return $wpdb->prefix . 'user_operations_history';
    }

    /**
     * Append a row to the immutable operations history log.
     * Never throws — history logging must not break the primary write.
     */
    private function append_operation_history($email, $azione, $strike, $scadenza_data, $scadenza_ora, $tipo_account, $balance = null) {
        global $wpdb;
        try {
            $wpdb->insert(
                $this->operations_history_table(),
                [
                    'user_email'    => $email,
                    'azione'        => $azione,
                    'strike'        => $strike,
                    'scadenza_data' => $scadenza_data,
                    'scadenza_ora'  => $scadenza_ora,
                    'tipo_account'  => $tipo_account,
                    'balance'       => $balance,
                    'at'            => current_time('mysql'),
                ],
                ['%s', '%s', '%f', '%s', '%s', '%s', '%f', '%s']
            );
        } catch (\Throwable $e) { /* swallow */ }
    }

    /**
     * POST /trading/v1/operations/open
     * Upsert: one row per user, stato = open.
     */
    public function record_operation_open($request) {
        global $wpdb;
        $table = $this->operations_table();

        $email         = sanitize_email($request->get_param('email'));
        $strike        = $request->get_param('strike') !== null ? floatval($request->get_param('strike')) : null;
        $scadenza_data = $request->get_param('scadenza_data') ? sanitize_text_field($request->get_param('scadenza_data')) : null;
        $scadenza_ora  = $request->get_param('scadenza_ora')  ? sanitize_text_field($request->get_param('scadenza_ora'))  : null;
        $tipo_account  = $request->get_param('tipo_account')  ? sanitize_text_field($request->get_param('tipo_account'))  : null;

        $result = $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO `$table`
                    (user_email, strike, scadenza_data, scadenza_ora, tipo_account, stato, aperta_at, chiusa_at)
                 VALUES (%s, %f, %s, %s, %s, 'open', NOW(), NULL)
                 ON DUPLICATE KEY UPDATE
                    strike        = VALUES(strike),
                    scadenza_data = VALUES(scadenza_data),
                    scadenza_ora  = VALUES(scadenza_ora),
                    tipo_account  = VALUES(tipo_account),
                    stato         = 'open',
                    aperta_at     = NOW(),
                    chiusa_at     = NULL",
                $email, $strike, $scadenza_data, $scadenza_ora, $tipo_account
            )
        );

        if ($result === false) {
            return new WP_Error('db_error', $wpdb->last_error, ['status' => 500]);
        }

        // Append to immutable history log (best-effort).
        $balance = $request->get_param('balance');
        $balance = $balance !== null && $balance !== '' ? floatval($balance) : null;
        $this->append_operation_history($email, 'OPEN', $strike, $scadenza_data, $scadenza_ora, $tipo_account, $balance);

        $this->log_event('/operations/open', 'POST', ['email' => $email, 'success' => 1]);
        return rest_ensure_response(['success' => true, 'stato' => 'open']);
    }

    /**
     * POST /trading/v1/operations/close
     * Mark the user's operation as closed.
     */
    public function record_operation_close($request) {
        global $wpdb;
        $table = $this->operations_table();

        $email = sanitize_email($request->get_param('email'));

        $result = $wpdb->update(
            $table,
            ['stato' => 'closed', 'chiusa_at' => current_time('mysql')],
            ['user_email' => $email],
            ['%s', '%s'],
            ['%s']
        );

        if ($result === false) {
            return new WP_Error('db_error', $wpdb->last_error, ['status' => 500]);
        }

        // Append to immutable history log with the snapshot of the just-closed op.
        $prev = $wpdb->get_row(
            $wpdb->prepare("SELECT strike, scadenza_data, scadenza_ora, tipo_account FROM `$table` WHERE user_email = %s", $email),
            ARRAY_A
        );
        $balance = $request->get_param('balance');
        $balance = $balance !== null && $balance !== '' ? floatval($balance) : null;
        $this->append_operation_history(
            $email, 'CLOSE',
            $prev ? $prev['strike']        : null,
            $prev ? $prev['scadenza_data'] : null,
            $prev ? $prev['scadenza_ora']  : null,
            $prev ? $prev['tipo_account']  : null,
            $balance
        );

        $this->log_event('/operations/close', 'POST', ['email' => $email, 'success' => 1]);
        return rest_ensure_response(['success' => true, 'stato' => 'closed']);
    }

    /**
     * GET /trading/v1/operations?email=...
     * Return the current operation state for a user.
     */
    public function get_operation($request) {
        global $wpdb;
        $table = $this->operations_table();

        $email = sanitize_email($request->get_param('email'));

        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM `$table` WHERE user_email = %s", $email),
            ARRAY_A
        );

        $this->log_event('/operations', 'GET', ['email' => $email]);
        return rest_ensure_response($row ?: null);
    }

    /**
     * GET /trading/v1/operations/history?email=...&limit=200&tipo_account=DEMO|REAL
     * Return the append-only history log (newest first).
     */
    public function get_operations_history($request) {
        global $wpdb;
        $table = $this->operations_history_table();

        $email = sanitize_email($request->get_param('email'));
        $limit = intval($request->get_param('limit'));
        if ($limit <= 0 || $limit > 2000) $limit = 500;
        $account = $request->get_param('tipo_account');
        $account = $account ? strtoupper(sanitize_text_field($account)) : null;

        if ($account && in_array($account, ['DEMO', 'REAL'], true)) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT id, azione, strike, scadenza_data, scadenza_ora, tipo_account, balance, at
                       FROM `$table`
                      WHERE user_email = %s AND tipo_account = %s
                      ORDER BY id DESC
                      LIMIT %d",
                    $email, $account, $limit
                ), ARRAY_A
            );
        } else {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT id, azione, strike, scadenza_data, scadenza_ora, tipo_account, balance, at
                       FROM `$table`
                      WHERE user_email = %s
                      ORDER BY id DESC
                      LIMIT %d",
                    $email, $limit
                ), ARRAY_A
            );
        }

        $this->log_event('/operations/history', 'GET', ['email' => $email, 'count' => is_array($rows) ? count($rows) : 0]);
        return rest_ensure_response([
            'success'    => true,
            'operations' => $rows ?: [],
        ]);
    }

    /* -----------------------------
     * Table resolution & logging
     * ----------------------------- */

    private function db_prefix() {
        global $wpdb;
        return $wpdb->prefix;
    }

    /**
     * Resolve the signals table name.
     * Priority: "{$prefix}{$base}" then "{$base}" (raw)
     */
    private function resolve_table_name($checkExists = true) {
        global $wpdb;

        $base = get_option(self::OPTION_TABLE_BASENAME, 'user_signals');
        $pref = $wpdb->prefix . $base;

        if (!$checkExists) return $pref;

        if ($this->table_exists($pref)) return $pref;
        if ($this->table_exists($base)) return $base;

        return false;
    }

    private function table_exists($table_name) {
        global $wpdb;
        $sql = $wpdb->prepare(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s",
            $table_name
        );
        return (int)$wpdb->get_var($sql) > 0;
    }

    private function column_exists($table, $column) {
        global $wpdb;
        $sql = $wpdb->prepare(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
            $table, $column
        );
        return (int)$wpdb->get_var($sql) > 0;
    }

    private function get_client_ip() {
        $candidates = [
            $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
            $_SERVER['HTTP_X_REAL_IP'] ?? null,
        ];

        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $forwarded = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
            foreach ($forwarded as $item) {
                $candidates[] = trim($item);
            }
        }

        $candidates[] = $_SERVER['REMOTE_ADDR'] ?? null;

        foreach ($candidates as $candidate) {
            if ($candidate && filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }

        return '0.0.0.0';
    }

    private function get_allowed_ips() {
        $raw = (string)get_option(self::OPTION_ALLOWED_IPS, '');
        return $this->normalize_ip_list_array($raw);
    }

    private function get_client_keys() {
        $keys = get_option(self::OPTION_CLIENT_KEYS, []);
        return is_array($keys) ? array_values($keys) : [];
    }

    private function save_client_keys(array $keys) {
        update_option(self::OPTION_CLIENT_KEYS, array_values($keys), false);
    }

    private function normalize_ip_list_array($raw) {
        if ($raw === '') {
            return [];
        }

        $parts = preg_split('/[\r\n,]+/', $raw);
        $result = [];

        foreach ($parts as $part) {
            $ip = trim((string)$part);
            if ($ip === '') {
                continue;
            }
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                $result[] = $ip;
            }
        }

        return array_values(array_unique($result));
    }

    private function normalize_ip_list_string($raw) {
        return implode("\n", $this->normalize_ip_list_array((string)$raw));
    }

    private function is_ip_allowed($ip) {
        $allowlist = $this->get_allowed_ips();
        if (empty($allowlist)) {
            return true;
        }
        return in_array($ip, $allowlist, true);
    }

    private function is_client_ip_allowed(array $client, $ip) {
        $allowlist = $this->normalize_ip_list_array((string)($client['allowed_ips'] ?? ''));
        if (empty($allowlist)) {
            return true;
        }
        return in_array($ip, $allowlist, true);
    }

    private function generate_api_key() {
        return bin2hex(random_bytes(32));
    }

    private function build_client_config_filename(array $client) {
        $label = sanitize_title($client['label'] ?? 'client');
        if ($label === '') {
            $label = 'client';
        }
        return $label . '-trading.env';
    }

    private function build_client_config_content($api_key, array $client) {
        $lines = [
            '# Nobel Trading client configuration',
            'TRADING_API_URL=' . untrailingslashit(rest_url('trading/v1')),
            'TRADING_API_KEY=' . (string)$api_key,
            'TRADING_CLIENT_LABEL=' . ($client['label'] ?? ''),
        ];

        if (!empty($client['email'])) {
            $lines[] = 'TRADING_CLIENT_EMAIL=' . $client['email'];
        }

        return implode("\n", $lines) . "\n";
    }

    private function hash_api_key($api_key) {
        return hash('sha256', (string)$api_key);
    }

    private function send_client_key_email($email, $label, $api_key, array $client) {
        if (empty($email) || !is_email($email)) {
            return false;
        }

        $subject = 'Your Nobel Trading API key';
        $message = "Hello {$label},\n\n";
        $message .= "Here is your Nobel Trading client configuration.\n\n";
        $message .= $this->build_client_config_content($api_key, $client);
        $message .= "\nKeep this key secure. If you lose it, a new key must be generated.\n";

        return wp_mail($email, $subject, $message);
    }

    private function sanitize_permissions($permissions) {
        if (!is_array($permissions)) {
            $permissions = [];
        }

        $allowed = ['read', 'write'];
        $result = array_values(array_unique(array_intersect(array_map('sanitize_text_field', $permissions), $allowed)));
        return !empty($result) ? $result : ['read'];
    }

    private function resolve_api_client($api_key) {
        $client_ip = $this->get_client_ip();
        $result = [
            'authenticated' => false,
            'label' => null,
            'email' => null,
            'permissions' => ['read', 'write'],
            'ip_allowed' => true,
        ];

        if (empty($api_key)) {
            return $result;
        }

        foreach ($this->get_client_keys() as $client) {
            if (($client['status'] ?? 'revoked') !== 'active') {
                continue;
            }

            $stored_hash = (string)($client['api_key_hash'] ?? '');
            if ($stored_hash === '') {
                continue;
            }

            if (hash_equals($stored_hash, $this->hash_api_key($api_key))) {
                $result['authenticated'] = true;
                $result['label'] = $client['label'] ?? null;
                $result['email'] = $client['email'] ?? null;
                $result['permissions'] = $this->sanitize_permissions($client['permissions'] ?? []);
                $result['ip_allowed'] = $this->is_client_ip_allowed($client, $client_ip);
                return $result;
            }
        }

        return $result;
    }

    private function get_required_permission($request) {
        $route = $request->get_route();
        $method = strtoupper($request->get_method());

        if ($method === 'GET' && preg_match('#/signals/pending$#', $route)) {
            return 'read';
        }

        if ($method === 'GET' && preg_match('#/signals/all$#', $route)) {
            return 'read';
        }

        if ($method === 'GET' && preg_match('#/margin$#', $route)) {
            return 'read';
        }

        if ($method === 'GET' && preg_match('#/logs#', $route)) {
            return 'read';
        }

        return 'write';
    }

    private function client_has_permission(array $auth_context, $required_permission) {
        $permissions = $auth_context['permissions'] ?? [];
        return in_array($required_permission, $permissions, true);
    }

    private function get_rate_limit_pm() {
        $limit = intval(get_option(self::OPTION_RATE_LIMIT_PM, 120));
        if ($limit < 10) $limit = 10;
        if ($limit > 2000) $limit = 2000;
        return $limit;
    }

    private function check_rate_limit($ip) {
        // Lightweight fixed-window rate limit per IP.
        // This protects WordPress/PHP from bots or client software polling too aggressively.
        $limit = $this->get_rate_limit_pm();
        $bucket = gmdate('YmdHi'); // one bucket per minute
        $key = 'trading_api_rl_' . md5((string)$ip . '|' . $bucket);
        $count = get_transient($key);
        $count = ($count === false) ? 0 : intval($count);

        if ($count >= $limit) {
            return false;
        }

        set_transient($key, $count + 1, 2 * MINUTE_IN_SECONDS);
        return true;
    }

    /**
     * Send email to a user
     */
    public function send_email($request) {
        $to      = sanitize_email($request->get_param('to'));
        $subject = sanitize_text_field($request->get_param('subject'));
        $body    = wp_kses_post($request->get_param('body'));

        if (empty($to) || !is_email($to)) {
            return new WP_Error('invalid_email', 'Invalid email address', ['status' => 400]);
        }

        if (empty($subject)) {
            return new WP_Error('missing_subject', 'Email subject is required', ['status' => 400]);
        }

        if (empty($body)) {
            return new WP_Error('missing_body', 'Email body is required', ['status' => 400]);
        }

        // Get user name if available
        $table = $this->resolve_table_name();
        $user_name = '';
        if ($table) {
            global $wpdb;
            $user = $wpdb->get_row($wpdb->prepare(
                "SELECT nome_completo, nome_comleto FROM `$table` WHERE email = %s LIMIT 1",
                $to
            ), ARRAY_A);
            if ($user) {
                $user_name = $user['nome_completo'] ?? $user['nome_comleto'] ?? '';
            }
        }

        // Replace variables in subject and body
        $subject = str_replace(['{{nome}}', '{{email}}'], [$user_name, $to], $subject);
        $body    = str_replace(['{{nome}}', '{{email}}'], [$user_name, $to], $body);

        // Set email headers
        $headers = [
            'Content-Type: text/html; charset=UTF-8',
            'From: Nobel Trading <noreply@formulablackscholes.com>',
        ];

        // Send email using WordPress wp_mail
        $sent = wp_mail($to, $subject, nl2br($body), $headers);

        // Log the email send attempt
        $this->log_event('/email/send', 'POST', [
            'email'   => $to,
            'subject' => $subject,
            'success' => $sent ? 1 : 0,
        ]);

        if ($sent) {
            return rest_ensure_response([
                'success' => true,
                'message' => 'Email sent successfully',
            ]);
        } else {
            return new WP_Error('email_failed', 'Failed to send email', ['status' => 500]);
        }
    }

    /**
     * Consent v2.0 — receive configuration document (PDF + metadata) and dispatch email.
     *
     * Payload JSON:
     *   configId, consentId, approvalTimestamp, docVersion, clientEmail,
     *   parameters { filterLevel, selectivityLabel, riskThreshold, minReturn,
     *                currency, capitalMode, capitalAmount, maxMargin },
     *   checkboxes [ { key, checked } ],
     *   softwareVersion,
     *   pdf_base64
     */
    public function submit_consent($request) {
        global $wpdb;

        $params = $request->get_json_params();
        if (!is_array($params)) $params = [];

        $config_id   = sanitize_text_field($params['configId'] ?? '');
        $consent_id  = sanitize_text_field($params['consentId'] ?? '');
        $approval_ts = sanitize_text_field($params['approvalTimestamp'] ?? '');
        $doc_version = sanitize_text_field($params['docVersion'] ?? '');
        $client_email = sanitize_email($params['clientEmail'] ?? '');
        $sw_version  = sanitize_text_field($params['softwareVersion'] ?? '');
        $parameters  = isset($params['parameters']) && is_array($params['parameters']) ? $params['parameters'] : [];
        $checkboxes  = isset($params['checkboxes']) && is_array($params['checkboxes']) ? $params['checkboxes'] : [];
        $pdf_b64     = $params['pdf_base64'] ?? '';

        if (empty($consent_id) || empty($config_id)) {
            return new WP_Error('missing_ids', 'configId and consentId required', ['status' => 400]);
        }
        if (empty($client_email) || !is_email($client_email)) {
            return new WP_Error('invalid_email', 'clientEmail is required and must be valid', ['status' => 400]);
        }
        if (empty($pdf_b64)) {
            return new WP_Error('missing_pdf', 'pdf_base64 is required', ['status' => 400]);
        }

        // Decode PDF
        $pdf_bin = base64_decode($pdf_b64, true);
        if ($pdf_bin === false || strlen($pdf_bin) < 100) {
            return new WP_Error('invalid_pdf', 'Invalid PDF payload', ['status' => 400]);
        }

        // Persist record in DB (create table on the fly)
        $table = $wpdb->prefix . 'trading_consents';
        $charset_collate = $wpdb->get_charset_collate();
        $wpdb->query("CREATE TABLE IF NOT EXISTS `$table` (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            consent_id VARCHAR(64) NOT NULL,
            config_id VARCHAR(64) NOT NULL,
            client_email VARCHAR(191) NOT NULL,
            approval_ts VARCHAR(40) NOT NULL,
            doc_version VARCHAR(20) NOT NULL,
            software_version VARCHAR(40) DEFAULT NULL,
            parameters LONGTEXT,
            checkboxes LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY consent_id (consent_id),
            KEY client_email (client_email)
        ) $charset_collate;");
        $wpdb->insert($table, [
            'consent_id'       => $consent_id,
            'config_id'        => $config_id,
            'client_email'     => $client_email,
            'approval_ts'      => $approval_ts,
            'doc_version'      => $doc_version,
            'software_version' => $sw_version,
            'parameters'       => wp_json_encode($parameters),
            'checkboxes'       => wp_json_encode($checkboxes),
        ]);

        // Write PDF to disk under uploads/consent-pdfs/
        $uploads = wp_upload_dir();
        $dir = trailingslashit($uploads['basedir']) . 'consent-pdfs';
        if (!file_exists($dir)) { wp_mkdir_p($dir); }
        $filename = sanitize_file_name($consent_id . '.pdf');
        $filepath = trailingslashit($dir) . $filename;
        file_put_contents($filepath, $pdf_bin);

        // Compose email
        $subject = sprintf('Formula Black & Scholes — Configurazione approvata (%s)', $consent_id);
        $body_lines = [
            '<p>Gentile Cliente,</p>',
            '<p>in allegato trova il documento di configurazione e attivazione da lei approvato.</p>',
            '<ul>',
            '<li><strong>ID configurazione:</strong> ' . esc_html($config_id) . '</li>',
            '<li><strong>ID consenso:</strong> ' . esc_html($consent_id) . '</li>',
            '<li><strong>Data e ora approvazione:</strong> ' . esc_html($approval_ts) . '</li>',
            '<li><strong>Versione documento:</strong> ' . esc_html($doc_version) . '</li>',
            '</ul>',
            '<p>La preghiamo di conservare il documento allegato.</p>',
            '<p>Formula Black &amp; Scholes</p>',
        ];
        $body = implode("\n", $body_lines);
        $headers = [
            'Content-Type: text/html; charset=UTF-8',
            'From: Formula Black & Scholes <noreply@formulablackscholes.com>',
        ];

        $sent_client = wp_mail($client_email, $subject, $body, $headers, [$filepath]);
        $sent_copy   = wp_mail('directors@formulablackscholes.com', $subject, $body, $headers, [$filepath]);

        $this->log_event('/consent-submit', 'POST', [
            'email'       => $client_email,
            'consent_id'  => $consent_id,
            'config_id'   => $config_id,
            'sent_client' => $sent_client ? 1 : 0,
            'sent_copy'   => $sent_copy ? 1 : 0,
        ]);

        return rest_ensure_response([
            'success'     => true,
            'consent_id'  => $consent_id,
            'sent_client' => (bool)$sent_client,
            'sent_copy'   => (bool)$sent_copy,
        ]);
    }

    private function log_event($route, $method, array $data = []) {
        global $wpdb;

        $normalized_route  = '/' . ltrim((string)$route, '/');
        $normalized_method = strtoupper((string)$method);

        // Do not log high-frequency polling/read endpoints unless explicitly enabled.
        // These endpoints are safe to call, but logging every call creates extra DB INSERTs.
        $log_read_endpoints = intval(get_option(self::OPTION_LOG_READ_ENDPOINTS, self::DEFAULT_LOG_READ_ENDPOINTS));
        $is_read_endpoint = ($normalized_method === 'GET') && in_array($normalized_route, [
            '/signals/pending',
            '/signals/all',
            '/logs',
            '/margin',
            '/operations',
            '/operations/history',
        ], true);
        if ($is_read_endpoint && !$log_read_endpoints) {
            return;
        }

        // Throttle repeated auth/rate-limit failures from the same IP.
        // Without this, a bot with a bad API key can fill the DB and burn CPU with INSERTs.
        if ($normalized_method === 'AUTH' || !empty($data['reason'])) {
            $reason = isset($data['reason']) ? (string)$data['reason'] : 'auth_event';
            $throttle_key = 'trading_api_log_throttle_' . md5($normalized_route . '|' . $reason . '|' . $this->get_client_ip());
            if (get_transient($throttle_key)) {
                return;
            }
            set_transient($throttle_key, 1, MINUTE_IN_SECONDS);
        }

        $logs_table = $wpdb->prefix . self::LOGS_TABLE_SUFFIX;
        if (!$this->table_exists($logs_table)) return;

        // Keep payload/user-agent small. Large JSON blobs in logs slow down inserts and reads.
        $payload = !empty($data) ? wp_json_encode($data) : null;
        if (is_string($payload) && strlen($payload) > 2000) {
            $payload = substr($payload, 0, 2000) . '...TRUNCATED';
        }

        $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? null;
        if (is_string($user_agent) && strlen($user_agent) > 255) {
            $user_agent = substr($user_agent, 0, 255);
        }

        $wpdb->insert(
            $logs_table,
            [
                'route'      => (string)$route,
                'method'     => (string)$method,
                'email'      => isset($data['email']) ? sanitize_email((string)$data['email']) : null,
                'signal_id'  => isset($data['signal_id']) ? intval($data['signal_id']) : null,
                'success'    => array_key_exists('success', $data) ? (int)$data['success'] : null,
                'payload'    => $payload,
                'ip'         => $this->get_client_ip(),
                'user_agent' => $user_agent,
                'created_at' => current_time('mysql'),
            ],
            ['%s','%s','%s','%d','%d','%s','%s','%s','%s']
        );

        $this->maybe_cleanup_logs();
    }

    private function maybe_cleanup_logs() {
        // Run cleanup at most once per day, triggered lazily by real API activity.
        if (get_transient('trading_api_logs_cleanup_done')) {
            return;
        }
        set_transient('trading_api_logs_cleanup_done', 1, DAY_IN_SECONDS);

        global $wpdb;
        $logs_table = $wpdb->prefix . self::LOGS_TABLE_SUFFIX;
        if (!$this->table_exists($logs_table)) return;

        $days = intval(get_option(self::OPTION_LOG_RETENTION_DAYS, self::DEFAULT_LOG_RETENTION_DAYS));
        if ($days < 1) $days = 1;
        if ($days > 90) $days = 90;

        $cutoff = gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS));
        $wpdb->query($wpdb->prepare("DELETE FROM `$logs_table` WHERE created_at < %s LIMIT 5000", $cutoff));
    }
}

/* -----------------------------
 * Activation: generate API key and create logs table
 * ----------------------------- */
register_activation_hook(__FILE__, 'trading_signals_activate');
function trading_signals_activate() {
    set_transient('trading_api_key_notice', 'activated', 60);

    if (!get_option(TradingSignalsAPI::OPTION_TABLE_BASENAME)) {
        add_option(TradingSignalsAPI::OPTION_TABLE_BASENAME, 'user_signals');
    }

    if (get_option(TradingSignalsAPI::OPTION_CLIENT_KEYS, null) === null) {
        add_option(TradingSignalsAPI::OPTION_CLIENT_KEYS, []);
    }

    if (get_option(TradingSignalsAPI::OPTION_ALLOWED_IPS, null) === null) {
        add_option(TradingSignalsAPI::OPTION_ALLOWED_IPS, '');
    }

    if (get_option(TradingSignalsAPI::OPTION_RATE_LIMIT_PM, null) === null) {
        add_option(TradingSignalsAPI::OPTION_RATE_LIMIT_PM, 120);
    }

    if (get_option(TradingSignalsAPI::OPTION_LOG_RETENTION_DAYS, null) === null) {
        add_option(TradingSignalsAPI::OPTION_LOG_RETENTION_DAYS, TradingSignalsAPI::DEFAULT_LOG_RETENTION_DAYS);
    }

    if (get_option(TradingSignalsAPI::OPTION_LOG_READ_ENDPOINTS, null) === null) {
        add_option(TradingSignalsAPI::OPTION_LOG_READ_ENDPOINTS, TradingSignalsAPI::DEFAULT_LOG_READ_ENDPOINTS);
    }

    global $wpdb;
    $charset_collate = $wpdb->get_charset_collate();
    $logs_table      = $wpdb->prefix . TradingSignalsAPI::LOGS_TABLE_SUFFIX;

    $sql = "CREATE TABLE IF NOT EXISTS `$logs_table` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `route` VARCHAR(100) NOT NULL,
        `method` VARCHAR(10) NOT NULL,
        `email` VARCHAR(255) NULL,
        `signal_id` BIGINT NULL,
        `success` TINYINT(1) NULL,
        `payload` LONGTEXT NULL,
        `ip` VARCHAR(64) NULL,
        `user_agent` TEXT NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_created_at` (`created_at`),
        KEY `idx_ip_created_at` (`ip`, `created_at`),
        KEY `idx_route_created_at` (`route`, `created_at`)
    ) $charset_collate;";  

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);

    // Create user_operations table
    $ops_table = $wpdb->prefix . 'user_operations';
    $sql_ops = "CREATE TABLE IF NOT EXISTS `$ops_table` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `user_email` VARCHAR(255) NOT NULL,
        `strike` DECIMAL(10,2) NULL,
        `scadenza_data` VARCHAR(10) NULL,
        `scadenza_ora` VARCHAR(8) NULL,
        `tipo_account` VARCHAR(10) NULL,
        `stato` ENUM('open','closed') NOT NULL DEFAULT 'open',
        `aperta_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `chiusa_at` DATETIME NULL DEFAULT NULL,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uq_user_email` (`user_email`),
        KEY `idx_stato` (`stato`),
        KEY `idx_aperta_at` (`aperta_at`)
    ) $charset_collate;";
    dbDelta($sql_ops);

    // Create user_operations_history table (append-only immutable log)
    $ops_hist_table = $wpdb->prefix . 'user_operations_history';
    $sql_ops_hist = "CREATE TABLE IF NOT EXISTS `$ops_hist_table` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `user_email` VARCHAR(255) NOT NULL,
        `azione` ENUM('OPEN','CLOSE') NOT NULL,
        `strike` DECIMAL(10,2) NULL,
        `scadenza_data` VARCHAR(10) NULL,
        `scadenza_ora` VARCHAR(8) NULL,
        `tipo_account` VARCHAR(10) NULL,
        `balance` DECIMAL(14,2) NULL,
        `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_user_at` (`user_email`, `at`),
        KEY `idx_user_account_at` (`user_email`, `tipo_account`, `at`)
    ) $charset_collate;";
    dbDelta($sql_ops_hist);
}

/* Bootstrap */
new TradingSignalsAPI();
