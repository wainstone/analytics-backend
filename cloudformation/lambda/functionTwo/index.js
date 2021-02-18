exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify('Im function two!'),
    };
    return response;
};