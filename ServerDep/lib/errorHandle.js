exports.errorAlert=function errorAlert(error, location, res){
    console.error('Error at '+location+': ', error);
    res.statusCode=503;
    res.send({
	result: 'error',
	err: error.code
    });
    return res;
};
