var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {
    var usersRoute = router.route('/users');
    var userByIdRoute = router.route('/users/:id');

    function parseQueryParams(req) {
        var query = {};
        var options = {};

        if (req.query.where) {
            try {
                query = JSON.parse(req.query.where);
            } catch (e) {
                throw new Error('Invalid JSON in where parameter');
            }
        }

        if (req.query.sort) {
            try {
                options.sort = JSON.parse(req.query.sort);
            } catch (e) {
                throw new Error('Invalid JSON in sort parameter');
            }
        }

        if (req.query.select) {
            try {
                options.select = JSON.parse(req.query.select);
            } catch (e) {
                throw new Error('Invalid JSON in select parameter');
            }
        }

        if (req.query.skip) {
            options.skip = parseInt(req.query.skip);
            if (isNaN(options.skip)) {
                throw new Error('Invalid skip parameter');
            }
        }

        if (req.query.limit) {
            options.limit = parseInt(req.query.limit);
            if (isNaN(options.limit)) {
                throw new Error('Invalid limit parameter');
            }
        }

        var count = false;
        if (req.query.count === 'true') {
            count = true;
        }

        return { query: query, options: options, count: count };
    }
    usersRoute.get(function (req, res) {
        try {
            var params = parseQueryParams(req);
            var mongooseQuery = User.find(params.query);

            if (params.options.sort) {
                mongooseQuery = mongooseQuery.sort(params.options.sort);
            }

            if (params.options.select) {
                mongooseQuery = mongooseQuery.select(params.options.select);
            }

            if (params.options.skip) {
                mongooseQuery = mongooseQuery.skip(params.options.skip);
            }

            if (params.options.limit) {
                mongooseQuery = mongooseQuery.limit(params.options.limit);
            }
            if (params.count) {
                mongooseQuery.countDocuments().exec(function (err, count) {
                    if (err) {
                        res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to count users' }
                        });
                    } else {
                        res.status(200).json({
                            message: 'OK',
                            data: count
                        });
                    }
                });
            } else {
                mongooseQuery.exec(function (err, users) {
                    if (err) {
                        res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to retrieve users' }
                        });
                    } else {
                        res.status(200).json({
                            message: 'OK',
                            data: users
                        });
                    }
                });
            }
        } catch (err) {
            res.status(400).json({
                message: 'Bad request',
                data: { error: err.message }
            });
        }
    });

    usersRoute.post(function (req, res) {
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({
                message: 'Bad request',
                data: { error: 'Name and email are required' }
            });
        }

        var pendingTasksPayload = req.body.pendingTasks;
        if (pendingTasksPayload === undefined || pendingTasksPayload === null) {
            pendingTasksPayload = [];
        } else if (!Array.isArray(pendingTasksPayload)) {
            pendingTasksPayload = [pendingTasksPayload];
        }
        pendingTasksPayload = pendingTasksPayload.map(function (t) { return String(t); });

        var userData = {
            name: req.body.name,
            email: req.body.email,
            pendingTasks: pendingTasksPayload,
            dateCreated: req.body.dateCreated || new Date()
        };

        var user = new User(userData);
        user.save(function (err, newUser) {
            if (err) {
                if (err.code === 11000 || err.message.includes('duplicate')) {
                    return res.status(400).json({
                        message: 'Bad request',
                        data: { error: 'A user with this email already exists' }
                    });
                }
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to create user' }
                });
            }

            res.status(201).json({
                message: 'Created',
                data: newUser
            });
        });
    });

    userByIdRoute.get(function (req, res) {
        try {
            var query = User.findById(req.params.id);
            
            if (req.query.select) {
                try {
                    var selectObj = JSON.parse(req.query.select);
                    query = query.select(selectObj);
                } catch (e) {
                    return res.status(400).json({
                        message: 'Bad request',
                        data: { error: 'Invalid JSON in select parameter' }
                    });
                }
            }

            query.exec(function (err, user) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to retrieve user' }
                    });
                }
                if (!user) {
                    return res.status(404).json({
                        message: 'Not found',
                        data: { error: 'User not found' }
                    });
                }
                res.status(200).json({
                    message: 'OK',
                    data: user
                });
            });
        } catch (err) {
            res.status(400).json({
                message: 'Bad request',
                data: { error: err.message }
            });
        }
    });

    userByIdRoute.put(function (req, res) {
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({
                message: 'Bad request',
                data: { error: 'Name and email are required' }
            });
        }

        User.findById(req.params.id, function (err, existingUser) {
            if (err) {
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to retrieve user' }
                });
            }
            if (!existingUser) {
                return res.status(404).json({
                    message: 'Not found',
                    data: { error: 'User not found' }
                });
            }

            if (existingUser.email !== req.body.email) {
                User.findOne({ email: req.body.email }, function (err, duplicateUser) {
                    if (err) {
                        return res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to check email uniqueness' }
                        });
                    }
                    if (duplicateUser) {
                        return res.status(400).json({
                            message: 'Bad request',
                            data: { error: 'A user with this email already exists' }
                        });
                    }
                    updateUser();
                });
            } else {
                updateUser();
            }
        });

        function updateUser() {
            var newPendingTasks = req.body.pendingTasks !== undefined ? req.body.pendingTasks : [];
            if (!Array.isArray(newPendingTasks)) {
                newPendingTasks = newPendingTasks !== undefined && newPendingTasks !== null ? [newPendingTasks] : [];
            }
            newPendingTasks = newPendingTasks.map(function (t) { return String(t); });
            var updateData = {
                name: req.body.name,
                email: req.body.email,
                pendingTasks: newPendingTasks,
                dateCreated: req.body.dateCreated || new Date()
            };

            User.findById(req.params.id, function (err, oldUser) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to retrieve user' }
                    });
                }
                if (!oldUser) {
                    return res.status(404).json({
                        message: 'Not found',
                        data: { error: 'User not found' }
                    });
                }

                var oldPendingTasks = oldUser.pendingTasks || [];
                
                Task.find({ _id: { $in: newPendingTasks } }, function (err, tasks) {
                    if (err) {
                        console.error('Error fetching tasks:', err);
                        tasks = [];
                    }
                    
                    var actualPendingTasks = [];
                    var taskMap = {};
                    if (tasks) {
                        tasks.forEach(function(task) {
                            taskMap[task._id.toString()] = task;
                            if (!task.completed) {
                                actualPendingTasks.push(task._id.toString());
                            }
                        });
                    }
                    newPendingTasks.forEach(function(taskId) {
                        if (actualPendingTasks.indexOf(taskId) === -1 && !taskMap[taskId]) {
                            actualPendingTasks.push(taskId);
                        }
                    });
                    
                    updateData.pendingTasks = actualPendingTasks;
                    
                    var tasksToRemove = oldPendingTasks.filter(function(taskId) {
                        return newPendingTasks.indexOf(taskId) === -1;
                    });

                    var tasksToAdd = newPendingTasks.filter(function(taskId) {
                        return oldPendingTasks.indexOf(taskId) === -1;
                    });

                    if (tasksToRemove.length > 0) {
                        Task.updateMany(
                            { _id: { $in: tasksToRemove } },
                            { $set: { assignedUser: "", assignedUserName: "unassigned" } },
                            function (err) {
                                if (err) {
                                    console.error('Error updating old tasks:', err);
                                }
                            }
                        );
                    }

                    User.findByIdAndUpdate(
                        req.params.id,
                        updateData,
                        { new: true, runValidators: true },
                        function (err, updatedUser) {
                            if (err) {
                                if (err.code === 11000 || err.message.includes('duplicate')) {
                                    return res.status(400).json({
                                        message: 'Bad request',
                                        data: { error: 'A user with this email already exists' }
                                    });
                                }
                                return res.status(500).json({
                                    message: 'Server error',
                                    data: { error: 'Failed to update user' }
                                });
                            }

                            if (tasksToAdd.length > 0) {
                                Task.updateMany(
                                    { _id: { $in: tasksToAdd } },
                                    { 
                                        $set: { 
                                            assignedUser: req.params.id,
                                            assignedUserName: updateData.name
                                        }
                                    },
                                    function (err) {
                                        if (err) {
                                            console.error('Error updating tasks:', err);
                                        }
                                    }
                                );
                            }

                            var tasksToUpdateName = newPendingTasks.filter(function(taskId) {
                                return oldPendingTasks.indexOf(taskId) !== -1;
                            });
                            if (tasksToUpdateName.length > 0 && oldUser.name !== updateData.name) {
                                Task.updateMany(
                                    { _id: { $in: tasksToUpdateName } },
                                    { 
                                        $set: { 
                                            assignedUserName: updateData.name
                                        }
                                    },
                                    function (err) {
                                        if (err) {
                                            console.error('Error updating task names:', err);
                                        }
                                    }
                                );
                            }

                            res.status(200).json({
                                message: 'OK',
                                data: updatedUser
                            });
                        }
                    );
                });
            });
        }
    });

    userByIdRoute.delete(function (req, res) {
        User.findById(req.params.id, function (err, user) {
            if (err) {
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to retrieve user' }
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: 'Not found',
                    data: { error: 'User not found' }
                });
            }

            var pendingTasks = user.pendingTasks || [];
            Task.updateMany(
                { _id: { $in: pendingTasks } },
                { $set: { assignedUser: "", assignedUserName: "unassigned" } },
                function (err) {
                    if (err) {
                        console.error('Error unassigning tasks:', err);
                    }
                }
            );

            User.findByIdAndDelete(req.params.id, function (err) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to delete user' }
                    });
                }
                res.status(204).send();
            });
        });
    });

    return router;
};

