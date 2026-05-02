const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
    const browser = env.browser || 'chrome';
    const manifestFile = `manifest.${browser}.json`;

    return {
        entry: {
            background: './src/background/index.js',
            content: './src/content/index.js',
            popup: './src/popup/index.js',
        },
        output: {
            path: path.resolve(__dirname, `dist/${browser}`),
            filename: '[name].js',
            clean: true,
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env'],
                            plugins: [
                                ['@babel/plugin-transform-react-jsx', { pragma: 'h' }]
                            ],
                        },
                    },
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        resolve: {
            extensions: ['.js', '.jsx'],
            alias: {
                // Alias 'react' and 'react-dom' to Preact for any lib that expects React
                'react': 'preact/compat',
                'react-dom': 'preact/compat',
            },
        },
        plugins: [
            new webpack.DefinePlugin({
                '__API_BASE__': JSON.stringify('http://192.168.100.3/v1')
            }),
            new CopyPlugin({
                patterns: [
                    { from: manifestFile, to: 'manifest.json' },
                    { from: 'src/popup/popup.html', to: 'popup.html' },
                    { from: 'src/assets', to: 'assets' },
                ],
            }),
        ],
        optimization: {
            // Keep each entry as a single file — extensions don't support chunk splitting
            splitChunks: false,
            runtimeChunk: false,
        },
    };
};
