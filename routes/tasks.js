var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {
    var tasksRoute = router.route('/tasks');
    var taskByIdRoute = router.route('/tasks/:id');

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

    tasksRoute.get(function (req, res) {
        try {
            var params = parseQueryParams(req);
            var mongooseQuery = Task.find(params.query);

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
            } else {
                mongooseQuery = mongooseQuery.limit(100);
            }

            if (params.count) {
                mongooseQuery.countDocuments().exec(function (err, count) {
                    if (err) {
                        res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to count tasks' }
                        });
                    } else {
                        res.status(200).json({
                            message: 'OK',
                            data: count
                        });
                    }
                });
            } else {
                mongooseQuery.exec(function (err, tasks) {
                    if (err) {
                        res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to retrieve tasks' }
                        });
                    } else {
                        res.status(200).json({
                            message: 'OK',
                            data: tasks
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

    tasksRoute.post(function (req, res) {
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({
                message: 'Bad request',
                data: { error: 'Name and deadline are required' }
            });
        }

        var taskData = {
            name: req.body.name,
            description: req.body.description || "",
            deadline: req.body.deadline,
            completed: req.body.completed !== undefined ? req.body.completed : false,
            assignedUser: req.body.assignedUser || "",
            assignedUserName: req.body.assignedUserName || "unassigned",
            dateCreated: req.body.dateCreated || new Date()
        };

        if (taskData.assignedUser) {
            User.findById(taskData.assignedUser, function (err, user) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to validate assigned user' }
                    });
                }
                if (!user) {
                    return res.status(400).json({
                        message: 'Bad request',
                        data: { error: 'Assigned user not found' }
                    });
                }
                taskData.assignedUserName = user.name;

                createTask(taskData, res);
            });
        } else {
            createTask(taskData, res);
        }
    });

    function createTask(taskData, res) {
        var task = new Task(taskData);
        task.save(function (err, newTask) {
            if (err) {
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to create task' }
                });
            }

            if (newTask.assignedUser && !newTask.completed) {
                User.findByIdAndUpdate(
                    newTask.assignedUser,
                    { $addToSet: { pendingTasks: newTask._id.toString() } },
                    function (err) {
                        if (err) {
                            console.error('Error updating user pendingTasks:', err);
                        }
                    }
                );
            }

            res.status(201).json({
                message: 'Created',
                data: newTask
            });
        });
    }

    taskByIdRoute.get(function (req, res) {
        try {
            var query = Task.findById(req.params.id);
            
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

            query.exec(function (err, task) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to retrieve task' }
                    });
                }
                if (!task) {
                    return res.status(404).json({
                        message: 'Not found',
                        data: { error: 'Task not found' }
                    });
                }
                res.status(200).json({
                    message: 'OK',
                    data: task
                });
            });
        } catch (err) {
            res.status(400).json({
                message: 'Bad request',
                data: { error: err.message }
            });
        }
    });

    taskByIdRoute.put(function (req, res) {
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({
                message: 'Bad request',
                data: { error: 'Name and deadline are required' }
            });
        }

       
        Task.findById(req.params.id, function (err, oldTask) {
            if (err) {
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to retrieve task' }
                });
            }
            if (!oldTask) {
                return res.status(404).json({
                    message: 'Not found',
                    data: { error: 'Task not found' }
                });
            }

            var updateData = {
                name: req.body.name,
                description: req.body.description !== undefined ? req.body.description : "",
                deadline: req.body.deadline,
                completed: req.body.completed !== undefined ? req.body.completed : false,
                assignedUser: req.body.assignedUser || "",
                assignedUserName: req.body.assignedUserName || "unassigned",
                dateCreated: req.body.dateCreated || new Date()
            };

            if (updateData.assignedUser) {
                User.findById(updateData.assignedUser, function (err, user) {
                    if (err) {
                        return res.status(500).json({
                            message: 'Server error',
                            data: { error: 'Failed to validate assigned user' }
                        });
                    }
                    if (!user) {
                        return res.status(400).json({
                            message: 'Bad request',
                            data: { error: 'Assigned user not found' }
                        });
                    }
                    updateData.assignedUserName = user.name;
                    updateTask(oldTask, updateData, res, req.params.id);
                });
            } else {
                updateTask(oldTask, updateData, res, req.params.id);
            }
        });
    });

    function updateTask(oldTask, updateData, res, taskId) {
        var oldAssignedUser = oldTask.assignedUser ? oldTask.assignedUser.toString() : "";
        var newAssignedUser = updateData.assignedUser || "";
        var oldCompleted = oldTask.completed;
        var newCompleted = updateData.completed;

        Task.findByIdAndUpdate(
            taskId,
            updateData,
            { new: true, runValidators: true },
            function (err, updatedTask) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to update task' }
                    });
                }

                var taskId = updatedTask._id.toString();

                if (oldAssignedUser && (oldAssignedUser !== newAssignedUser || newCompleted)) {
                    User.findByIdAndUpdate(
                        oldAssignedUser,
                        { $pull: { pendingTasks: taskId } },
                        function (err) {
                            if (err) {
                                console.error('Error removing task from user:', err);
                            }
                        }
                    );
                }

                if (newAssignedUser && oldAssignedUser !== newAssignedUser && !newCompleted) {
                    User.findByIdAndUpdate(
                        newAssignedUser,
                        { $addToSet: { pendingTasks: taskId } },
                        function (err) {
                            if (err) {
                                console.error('Error adding task to user:', err);
                            }
                        }
                    );
                }

                if (oldAssignedUser && oldAssignedUser === newAssignedUser) {
                    if (!oldCompleted && newCompleted) {
                        User.findByIdAndUpdate(
                            oldAssignedUser,
                            { $pull: { pendingTasks: taskId } },
                            function (err) {
                                if (err) {
                                    console.error('Error removing completed task from user:', err);
                                }
                            }
                        );
                    } else if (oldCompleted && !newCompleted) {
                        User.findByIdAndUpdate(
                            oldAssignedUser,
                            { $addToSet: { pendingTasks: taskId } },
                            function (err) {
                                if (err) {
                                    console.error('Error adding uncompleted task to user:', err);
                                }
                            }
                        );
                    }
                }

                res.status(200).json({
                    message: 'OK',
                    data: updatedTask
                });
            }
        );
    }

    taskByIdRoute.delete(function (req, res) {
        Task.findById(req.params.id, function (err, task) {
            if (err) {
                return res.status(500).json({
                    message: 'Server error',
                    data: { error: 'Failed to retrieve task' }
                });
            }
            if (!task) {
                return res.status(404).json({
                    message: 'Not found',
                    data: { error: 'Task not found' }
                });
            }

            if (task.assignedUser) {
                User.findByIdAndUpdate(
                    task.assignedUser,
                    { $pull: { pendingTasks: req.params.id } },
                    function (err) {
                        if (err) {
                            console.error('Error removing task from user:', err);
                        }
                    }
                );
            }

            Task.findByIdAndDelete(req.params.id, function (err) {
                if (err) {
                    return res.status(500).json({
                        message: 'Server error',
                        data: { error: 'Failed to delete task' }
                    });
                }
                res.status(204).send();
            });
        });
    });

    return router;
};

