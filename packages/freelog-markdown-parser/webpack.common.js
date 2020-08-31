module.exports = {
	entry: {
		app: './src/index.js',
	},
	module: {
		rules: [
			{
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: [ 'babel-loader','source-map-loader' ]
      },
			{
				test: /\.css$/,
				use: [
					'raw-loader',
				],
			},
			{
				test: /\.less$/,
				use: [
					{
						loader: 'raw-loader',
					},
					{
						loader: "less-loader",
					},
				],
			},
			{
				test: /\.(png|svg|jpg|gif)$/,
				use: [
					{
						loader: 'url-loader',
						options: {
							limit: true,
						},
					},
				],
			},
		],
	},
};
