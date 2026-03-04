module.exports = {
    apps: [
        {
            name: 'btc-arena-server',
            script: 'server/index.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
            env: {
                NODE_ENV: 'production',
                PORT: 8080,
            },
        },
        {
            name: 'btc-arena-python-ml',
            script: 'app.py',
            cwd: __dirname + '/server/ml',
            interpreter: 'python3',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
            env: {
                FLASK_PORT: 5000,
            },
        }
    ],
};
