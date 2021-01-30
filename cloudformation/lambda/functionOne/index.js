exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify('function one YOHOO!'),
    };
    return response;
};